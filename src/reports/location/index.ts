import { Checklist, getLocationDetails } from "../queries/getLocationDetails";
import { getLocationForm as getLocationForm } from "../queries/getLocationForm";
import { InvocationContext } from "@azure/functions";
import { getInspectorDetails } from "../queries/getInspectorInfo";
import { getLocationPDF } from "./template";
import { Location } from "./types";

const MAX_FOLLOW_UPS = 5;

const getReadableName = (structure: string, question: string, row: string) => {
  const { pages } = JSON.parse(structure);
  // find question
  const allQuestions = (pages ?? []).map((p: any) => p.elements).flat();
  const targetQuestion = allQuestions.find((q: any) => q.name === question);
  const targetRow = targetQuestion?.rows?.find((r: any) => r.value === row);
  return targetRow?.text ?? row;
};

const extractInspectionActions = (
  data: Awaited<ReturnType<typeof getLocationDetails>>,
  structure: string
) => {
  const checklists = [
    "checklist_gls_actions",
    "checklist_osh_ps_actions",
    "checklist_osh_a_i_actions",
    "checklist_social_security_actions",
  ] as const;

  const actions: { point: string; action: string; comment: string }[] = [];

  for (const checklist of checklists) {
    const checklistData = data[checklist] ?? {};
    const rows = Object.keys(checklistData);
    for (const row of rows) {
      // Now we need to get the readable name of the row from the structure
      const readableName = getReadableName(structure, checklist, row);
      if (checklistData[row].issue_noted) {
        actions.push({
          point: readableName,
          action: checklistData[row].checklist_inspection_action,
          comment: checklistData[row].checklist_comment,
        });
      }
    }
  }

  return actions;
};

const extractFollowUpActions = (
  data: Awaited<ReturnType<typeof getLocationDetails>>,
  followUp: string,
  structure: string
) => {
  const checklists = [
    "checklist_gls_",
    "checklist_osh_ps_",
    "checklist_osh_a_i_",
    "checklist_social_security_",
  ] as const;

  const actions: {
    point: string;
    action: string;
    status: string;
    comment: string;
  }[] = [];

  for (const checklist of checklists) {
    const checklistData = (data[`${checklist}${followUp}`] as Checklist) ?? {};
    const rows = Object.keys(checklistData);

    for (const row of rows) {
      // Now we need to get the readable name of the row from the structure
      const readableName = getReadableName(
        structure,
        `${checklist}${followUp}`,
        row
      );
      if (checklistData[row][`${followUp}_status`]) {
        actions.push({
          point: readableName,
          action: checklistData[row][`${followUp}_action`],
          status: checklistData[row][`${followUp}_status`],
          comment: checklistData[row][`${followUp}_comment`],
        });
      }
    }
  }

  return actions;
};

export const getLocationReport = async (
  locationID: string,
  context: InvocationContext,
  token: string
) => {
  // Get the form linked to the location
  const form = await getLocationForm(locationID, token, context);
  if (!form) {
    throw new Error(`Location ${locationID} has no form!`);
  }

  const { structure, queryName } = form;
  const locationData = await getLocationDetails(
    locationID,
    queryName,
    token,
    context
  );

  // Following the order of the report structure (https://miro.com/app/board/uXjVM0lP5F8=/)
  const formattedLocationData: Location = {
    // Enterprise information
    enterprise: {
      name: locationData.enterprise_context?.name,
      address: locationData.enterprise_context?.address,
      id: locationData.enterprise_context?.incrementalId,
      repName: `${
        locationData.enterprise_context?.legal_rep_first_name || ""
      } ${locationData.enterprise_context?.legal_rep_last_name || ""}`,
      // comments: locationData.enterprise_context?.comments, (MISSING FIELD)
    },

    // Inspection information
    // contraventionsFound: locationData.contraventions_found, (MISSING FIELD)
    // contraventions: locationData.contraventions, (MISSING FIELD)
    inspection: {
      date: locationData.date_inspection_conducted,
      comments: locationData.inspection_report_comment,
      actions: extractInspectionActions(locationData, structure),
    },

    followups: Array.from(Array(MAX_FOLLOW_UPS), (_, i) => i + 1)
      .map((i) => {
        // Checks if follow up exists
        const followUp = i !== 1 ? `follow_up_${i}` : "follow_up";
        if (!locationData[followUp]) {
          return null;
        }

        // Date key for respective follow up
        const followUpDate = `date_${followUp}`;

        // Comment key for respective follow up
        const followUpComment = `${followUp}_comment`;

        return {
          date: locationData[followUpDate],
          actions: extractFollowUpActions(locationData, followUp, structure),
          comments: locationData[followUpComment],
        };
      })
      .filter((f) => f !== null),

    inspector:
      locationData.last_inspector_assigned_users &&
      (await getInspectorDetails(
        locationData.last_inspector_assigned_users[0],
        token,
        context
      )),

    reportDate: new Date(),
    locationID: locationData.incrementalId,
    // notificationDate: locationData.notification_date, (MISSING FIELD)
  };

  // Get the logo
  let logo = JSON.parse(structure).logo;
  if (typeof logo === "object") {
    logo = logo.default;
  }

  const pdf = await getLocationPDF(
    formattedLocationData,
    typeof logo === "string" ? logo : undefined
  );
  return { pdf, fileName: `Report-${locationData.incrementalId}.pdf` };
};
