import { handleParseDocumentQuestions } from './_lib.js';

export default async function handler(req, res) {
  return handleParseDocumentQuestions(req, res);
}
