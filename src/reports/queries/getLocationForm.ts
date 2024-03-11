import { InvocationContext } from "@azure/functions";
import { buildOortQuery } from "../../shared/connector";

const GET_LOCATION_FORM = (locationID: string) =>
  JSON.stringify({
    operationName: "GetCustomQuery",
    variables: { id: locationID },
    query: `query GetCustomQuery($id: ID!) {
        record(id: $id) {
          id
          form {
            id
            structure
            queryName
          }
        }
      }`,
  });

type LocationFormResponse = {
  record: {
    id: string;
    form: {
      id: string;
      structure: string;
      queryName: string;
    };
  };
};

export const getLocationForm = async (
  queryName: string,
  token: string,
  context: InvocationContext
) => {
  try {
    // First we need to get the queryName for the location record
    const locationFormRes = await buildOortQuery<LocationFormResponse>(
      GET_LOCATION_FORM(queryName),
      token
    );
    console.log("locationFormRes", locationFormRes.record.form);

    return locationFormRes.record.form;
  } catch (err) {
    context.error("Error fetching location form:", err);
    return null;
  }
};
