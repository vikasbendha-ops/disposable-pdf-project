import { handleApiRequest } from "../../lib/api-handler";

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
  },
};

export default async function handler(req, res) {
  await handleApiRequest(req, res, []);
}
