// Vercel Serverless Function — generates an invoice PDF server-side, for
// callers that have no browser (the process-recurring-invoices Supabase Edge
// Function's auto-send flow). Reuses the exact same @react-pdf/renderer
// PdfDocument used everywhere else in the app (src/pdf/PdfDocument.jsx) via
// its Node-side renderToBuffer/toBuffer API, instead of standing up a second,
// hand-written HTML/CSS invoice template — output is pixel-identical to any
// other invoice PDF in the app.
// POST /api/generate-invoice-pdf

import { createClient } from '@supabase/supabase-js';
import React from 'react';
// @react-pdf/renderer is ESM-only. This function is compiled to CommonJS by
// Vercel (no "type": "module" in package.json), and a static `import` of an
// ESM-only package gets transpiled into a `require()` that throws
// ERR_REQUIRE_ESM at runtime. A dynamic import() avoids that — same fix
// src/lib/pdfBuffer.js already uses for the client-side build.

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    const { invoice_id, user_id } = req.body || {};
    if (!invoice_id || !user_id) {
      return res.status(400).json({ error: 'invoice_id and user_id are required' });
    }

    const { data: invoice, error: invErr } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoice_id)
      .maybeSingle();

    if (invErr || !invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    if (invoice.user_id !== user_id) {
      return res.status(403).json({ error: 'user_id does not match this invoice' });
    }

    const [{ data: items }, { data: profile }, { data: client }] = await Promise.all([
      supabase.from('invoice_items').select('*').eq('invoice_id', invoice_id),
      supabase.from('profiles').select('*').eq('id', user_id).maybeSingle(),
      invoice.client_id
        ? supabase.from('clients').select('*').eq('id', invoice.client_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    // Mirrors exactly what every other pdfData object in Invoices.jsx builds —
    // same field names PdfDocument.jsx already expects.
    const data = {
      ...invoice,
      client_name:    client?.name || '',
      client_company: client?.company_name || '',
      client_email:   client?.email || '',
      client_phone:   client?.phone || '',
      client_address: client?.address || '',
      items:          items || [],
      payments:       [],
    };

    // settings is passed through exactly as the client-side flow passes the
    // raw `profiles` row (see useAppData()'s `profile`) — same shape, so the
    // server-rendered PDF matches what a manually-downloaded one looks like.
    const logoSrc = profile?.logo_url || '';
    const settings = logoSrc ? { ...profile, _logoSrc: logoSrc } : (profile || {});

    const [{ pdf }, { PdfDocument }] = await Promise.all([
      import('@react-pdf/renderer'),
      import('../src/pdf/PdfDocument.jsx'),
    ]);

    const element = React.createElement(PdfDocument, { data, settings, docType: 'INVOICE' });
    const instance = pdf(element);
    const stream = await instance.toBuffer();
    const pdfBuffer = await streamToBuffer(stream);

    return res.status(200).json({
      success: true,
      pdf_base64: pdfBuffer.toString('base64'),
      filename: `Invoice-${invoice.invoice_number}.pdf`,
    });
  } catch (error) {
    console.error('generate-invoice-pdf error:', error);
    return res.status(500).json({ error: error.message || 'PDF generation failed' });
  }
}
