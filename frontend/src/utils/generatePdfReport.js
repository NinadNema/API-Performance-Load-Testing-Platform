import { jsPDF } from 'jspdf';

export function generateExecutivePdfReport({ run, metrics, apdex, insights, slaVerdict }) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 16;

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 28, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('EXECUTIVE PERFORMANCE AUDIT REPORT', 14, 13);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(148, 163, 184);
  const dateStr = run?.created_at || new Date().toISOString();
  doc.text(`Run ID: #${run?.id || 'LIVE'}  |  Generated: ${dateStr}`, 14, 21);

  y = 36;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(30, 41, 59);
  doc.text('TEST CONFIGURATION & TARGET', 14, y);
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(`Target URL: ${run?.url || 'N/A'}`, 14, y);
  y += 5;
  doc.text(`Method: ${run?.method || 'GET'}   |   Concurrency (VUs): ${run?.concurrency || 1}   |   Total Requests: ${run?.total_requests || metrics?.totalRequests || 0}`, 14, y);
  y += 8;

  const boxY = y;
  const boxWidth = (pageWidth - 36) / 2;

  const verdictPassed = slaVerdict ? slaVerdict.passed : (metrics?.successRate >= 99 && (metrics?.p95 || 0) < 1000);
  const verdictText = slaVerdict
    ? (verdictPassed ? 'SLA AUDIT: PASSED' : 'SLA AUDIT: FAILED')
    : (verdictPassed ? 'OVERALL HEALTH: OPTIMAL' : 'OVERALL HEALTH: DEGRADED');

  doc.setFillColor(verdictPassed ? 240 : 254, verdictPassed ? 253 : 242, verdictPassed ? 244 : 242);
  doc.setDrawColor(verdictPassed ? 34 : 239, verdictPassed ? 197 : 68, verdictPassed ? 94 : 68);
  doc.roundedRect(14, boxY, boxWidth, 22, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(verdictPassed ? 22 : 185, verdictPassed ? 101 : 28, verdictPassed ? 52 : 28);
  doc.text(verdictText, 18, boxY + 8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(slaVerdict?.summary || (verdictPassed ? 'Performance satisfies standard SLA thresholds.' : 'High latency or errors observed.'), 18, boxY + 15);

  const apdexScore = apdex?.score ?? (metrics?.p50 ? 0.95 : 1.0);
  const apdexRating = apdex?.rating ?? 'Good';

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(18 + boxWidth, boxY, boxWidth, 22, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 41, 59);
  doc.text(`APDEX SCORE: ${apdexScore} (${apdexRating})`, 22 + boxWidth, boxY + 8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(`Satisfied: ${apdex?.satisfied || 0}  |  Tolerating: ${apdex?.tolerating || 0}  |  Frustrated: ${apdex?.frustrated || 0}`, 22 + boxWidth, boxY + 15);

  y = boxY + 30;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(30, 41, 59);
  doc.text('KEY PERFORMANCE INDICATORS (KPIs)', 14, y);
  y += 6;

  const kpis = [
    ['Throughput', `${metrics?.throughputRps ?? 0} RPS`],
    ['Success Rate', `${metrics?.successRate ?? 0}%`],
    ['Total Duration', `${metrics?.totalDurationMs ?? run?.total_duration_ms ?? 0} ms`],
    ['Average Latency', `${metrics?.avgMs ?? 0} ms`],
    ['Min Latency', `${metrics?.minMs ?? 0} ms`],
    ['Max Latency', `${metrics?.maxMs ?? 0} ms`],
    ['P50 Latency (Median)', `${metrics?.p50 ?? 0} ms`],
    ['P95 Latency', `${metrics?.p95 ?? 0} ms`],
    ['P99 Latency', `${metrics?.p99 ?? 0} ms`],
  ];

  doc.setFillColor(241, 245, 249);
  doc.rect(14, y, pageWidth - 28, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text('METRIC', 18, y + 5);
  doc.text('MEASURED VALUE', 110, y + 5);
  y += 7;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);

  kpis.forEach(([label, val], idx) => {
    if (idx % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(14, y, pageWidth - 28, 6, 'F');
    }
    doc.text(label, 18, y + 4.5);
    doc.text(val, 110, y + 4.5);
    y += 6;
  });

  y += 6;

  if (slaVerdict && Array.isArray(slaVerdict.rules) && slaVerdict.rules.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(30, 41, 59);
    doc.text('SLA BUDGET COMPLIANCE MATRIX', 14, y);
    y += 6;

    doc.setFillColor(241, 245, 249);
    doc.rect(14, y, pageWidth - 28, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text('RULE', 18, y + 5);
    doc.text('TARGET', 65, y + 5);
    doc.text('ACTUAL', 110, y + 5);
    doc.text('STATUS', 155, y + 5);
    y += 7;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);

    slaVerdict.rules.forEach((rule, idx) => {
      if (idx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(14, y, pageWidth - 28, 6, 'F');
      }
      doc.setTextColor(30, 41, 59);
      doc.text(rule.metric, 18, y + 4.5);
      doc.text(rule.target, 65, y + 4.5);
      doc.text(rule.actual, 110, y + 4.5);

      doc.setFont('helvetica', 'bold');
      if (rule.passed) {
        doc.setTextColor(22, 101, 52);
        doc.text('PASS', 155, y + 4.5);
      } else {
        doc.setTextColor(185, 28, 28);
        doc.text('FAIL', 155, y + 4.5);
      }
      doc.setFont('helvetica', 'normal');
      y += 6;
    });

    y += 6;
  }

  if (Array.isArray(insights) && insights.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(30, 41, 59);
    doc.text('DIAGNOSTIC FINDINGS & INTELLIGENCE', 14, y);
    y += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);

    insights.slice(0, 6).forEach((ins) => {
      const isErr = ins.level === 'error';
      const isWarn = ins.level === 'warning';
      const bulletColor = isErr ? [220, 38, 38] : isWarn ? [217, 119, 6] : [16, 185, 129];

      doc.setFillColor(...bulletColor);
      doc.circle(17, y + 2.5, 1.2, 'F');

      doc.setTextColor(51, 65, 85);
      const splitText = doc.splitTextToSize(ins.message, pageWidth - 36);
      doc.text(splitText, 22, y + 3.5);
      y += splitText.length * 4.5 + 2;
    });
  }

  const footerY = 285;
  doc.setDrawColor(226, 232, 240);
  doc.line(14, footerY - 4, pageWidth - 14, footerY - 4);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text('CONFIDENTIAL - API PERFORMANCE LOAD TESTING PLATFORM', 14, footerY);
  doc.text(`Page 1 of 1`, pageWidth - 28, footerY);

  const safeName = (run?.url || 'test')
    .replace(/^https?:\/\//, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 25);

  doc.save(`Executive-Audit-${safeName}-${Date.now()}.pdf`);
}
