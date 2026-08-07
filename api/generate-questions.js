import { handleGenerateQuestions } from './_lib.js';

export default async function handler(req, res) {
  return handleGenerateQuestions(req, res);
}
