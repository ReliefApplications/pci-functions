import { InvocationContext } from "@azure/functions";
import { getLocationReport } from "./location";

/**
 * Generate a location report.
 *
 * @param recordID The ID of the record
 * @param context The invocation context
 * @param token (Optional) The token for authentication
 * @returns A promise resolving to the PDF report and its file name
 */
export const getReport = async (
  recordID: string,
  context: InvocationContext,
  token?: string
): Promise<{ pdf: any; fileName: string }> => {
  return getLocationReport(recordID, context, token);
};
