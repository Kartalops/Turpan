// Fake auth — returns hardcoded success without real JWT verification
export async function POST(request: Request) {
  return Response.json({ success: true, token: 'fake-token-123' });
}
