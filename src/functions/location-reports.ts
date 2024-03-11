import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { getReport } from "../reports";

export async function locationReports(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const { contextID } = request.params;

  // Get bearer token
  const token = request.headers.get("authorization")?.split(" ")[1];

  // if (!token) {
  //   return {
  //     status: 401,
  //     body: "Authorization missing.",
  //   };
  // }

  const { pdf, fileName } = await getReport(contextID, context, token);

  return {
    body: pdf as any,
    headers: {
      "Content-Disposition": `attachment; filename=${fileName}`,
    },
  };
}

app.http("report", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: locationReports,
  route: "report/{contextID}",
});
