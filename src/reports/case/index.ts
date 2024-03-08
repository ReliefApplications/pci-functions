import { Checklist, getCaseDetails } from '../queries/getCaseDetails';
import { getCaseForm } from '../queries/getCaseForm';
import { InvocationContext } from '@azure/functions';
import { getInspectorDetails } from '../queries/getInspectorInfo';
import { getCasePDF } from './template';
import { Case } from './types';

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
  data: Awaited<ReturnType<typeof getCaseDetails>>,
  structure: string
) => {
  const checklists = [
    'checklist_gls_actions',
    'checklist_osh_ps_actions',
    'checklist_osh_a_i_actions',
    'checklist_social_security_actions',
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
  data: Awaited<ReturnType<typeof getCaseDetails>>,
  followUp: string,
  structure: string
) => {
  const checklists = [
    'checklist_gls_',
    'checklist_osh_ps_',
    'checklist_osh_a_i_',
    'checklist_social_security_',
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

export const getCaseReport = async (
  caseID: string,
  context: InvocationContext,
  token: string
) => {
  // Get the form linked to the case
  const form = await getCaseForm(caseID, token, context);
  if (!form) {
    throw new Error(`Case ${caseID} has no form!`);
  }

  const { structure, queryName } = form;
  const caseData = await getCaseDetails(caseID, queryName, token, context);

  // Following the order of the report structure (https://miro.com/app/board/uXjVM0lP5F8=/)
  const formattedCaseData: Case = {
    // Enterprise information
    enterprise: {
      name: caseData.enterprise_context?.name,
      address: caseData.enterprise_context?.address,
      id: caseData.enterprise_context?.incrementalId,
      repName: `${caseData.enterprise_context?.legal_rep_first_name || ''} ${
        caseData.enterprise_context?.legal_rep_last_name || ''
      }`,
      // comments: caseData.enterprise_context?.comments, (MISSING FIELD)
    },

    // Inspection information
    // contraventionsFound: caseData.contraventions_found, (MISSING FIELD)
    // contraventions: caseData.contraventions, (MISSING FIELD)
    inspection: {
      date: caseData.date_inspection_conducted,
      comments: caseData.inspection_report_comment,
      actions: extractInspectionActions(caseData, structure),
    },

    followups: Array.from(Array(MAX_FOLLOW_UPS), (_, i) => i + 1)
      .map((i) => {
        // Checks if follow up exists
        const followUp = i !== 1 ? `follow_up_${i}` : 'follow_up';
        if (!caseData[followUp]) {
          return null;
        }

        // Date key for respective follow up
        const followUpDate = `date_${followUp}`;

        // Comment key for respective follow up
        const followUpComment = `${followUp}_comment`;

        return {
          date: caseData[followUpDate],
          actions: extractFollowUpActions(caseData, followUp, structure),
          comments: caseData[followUpComment],
        };
      })
      .filter((f) => f !== null),

    inspector:
      caseData.last_inspector_assigned_users &&
      (await getInspectorDetails(
        caseData.last_inspector_assigned_users[0],
        token,
        context
      )),

    reportDate: new Date(),
    caseID: caseData.incrementalId,
    // notificationDate: caseData.notification_date, (MISSING FIELD)
  };

  // Get the logo
  let logo = JSON.parse(structure).logo;
  if (typeof logo === 'object') {
    logo = logo.default;
  }

  const pdf = await getCasePDF(
    formattedCaseData,
    typeof logo === 'string' ? logo : undefined
  );
  return { pdf, fileName: `Report-${caseData.incrementalId}.pdf` };
};
