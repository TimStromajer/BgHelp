import { SONIOX_API_KEY } from "$env/static/private";

export async function GET({ url }) {
  let response = { key: SONIOX_API_KEY };
  return new Response(JSON.stringify(response), { status: 200, headers: { 'Content-Type': 'application/json' } });
}