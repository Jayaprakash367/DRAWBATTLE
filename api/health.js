// Minimal health check endpoint for Vercel
export default function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: 'vercel-serverless'
    });
  }
  res.status(405).json({ error: 'Method not allowed' });
}
