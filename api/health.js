import { handleHealthCheck } from './_lib.js';

export default async function handler(req, res) {
  return handleHealthCheck(req, res);
}
