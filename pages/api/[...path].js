import { handleApiRequest } from "../../lib/api-handler";

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
  },
};

export default async function handler(req, res) {
  const pathSegments = Array.isArray(req.query.path)
    ? req.query.path
    : req.query.path
      ? [req.query.path]
      : [];

  await handleApiRequest(req, res, pathSegments);
}
