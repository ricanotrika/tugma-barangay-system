import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase;
if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
}

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Send a POST request.' });
  }

  try {
    const { lostReport } = req.body || {};

    if (!lostReport) {
      return res.status(400).json({ error: 'Missing lostReport payload.' });
    }

    // If Supabase credentials are missing, return a clean error instead of crashing
    if (!supabase) {
      console.warn("Supabase credentials not configured in Vercel environment.");
      return res.status(200).json({
        matches: [],
        message: "Server connected, but Supabase environment variables (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY) are missing."
      });
    }

    // Fetch existing found reports from database
    const { data: foundItems, error } = await supabase
      .from('reports')
      .select('*')
      .eq('report_type', 'found');

    if (error) {
      console.error("Supabase Error:", error);
      return res.status(500).json({ error: error.message });
    }

    // Simple matching demonstration loop (30% Category, 20% Color, 30% Description, 10% Location, 10% Date)
    const matches = (foundItems || []).map(item => {
      let score = 0;
      if (item.category?.toLowerCase() === lostReport.category?.toLowerCase()) score += 30;
      if (item.color?.toLowerCase() === lostReport.color?.toLowerCase()) score += 20;
      
      // Basic text inclusion check for description
      if (item.description && lostReport.description && 
         (item.description.toLowerCase().includes(lostReport.description.toLowerCase()) || 
          lostReport.description.toLowerCase().includes(item.description.toLowerCase()))) {
        score += 30;
      } else {
        score += 15; // partial
      }

      if (item.location?.toLowerCase() === lostReport.location?.toLowerCase()) score += 10;
      if (item.report_date === lostReport.report_date) score += 10;

      return {
        foundItem: item,
        matchScore: score,
        confidenceTier: score >= 85 ? 'High' : 'Medium',
        scoreBreakdown: { category: 30, color: 20, description: 15, location: 10, date: 10 }
      };
    }).filter(m => m.matchScore >= 50);

    return res.status(200).json({ matches });

  } catch (err) {
    console.error("Handler exception:", err);
    return res.status(500).json({ error: err.message || "Internal Server Error" });
  }
}
