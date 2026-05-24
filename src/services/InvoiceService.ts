/**
 * InvoiceService
 *
 * On iOS/Android: generates a real PDF via expo-print and shares via expo-sharing.
 * On Web: opens a browser print dialog using window.print() on an injected HTML page.
 *
 * expo-print, expo-file-system, and expo-sharing are native-only packages that crash
 * on web if imported at module level. All imports are dynamic and Platform-gated.
 */
import { Platform } from 'react-native';
import { Invoice } from '@/store';
import { formatCurrency } from '@/utils/format';
import { format } from 'date-fns';

// ─── HTML Template (shared between web and native PDF) ────────────────────────
function buildInvoiceHTML(invoice: Invoice, companyName: string): string {
  const lineItemRows = invoice.lineItems.map(item => `
    <tr>
      <td class="desc">${item.description}</td>
      <td class="center">${item.quantity}</td>
      <td class="right">${formatCurrency(item.unitPrice)}</td>
      <td class="right">${formatCurrency(item.quantity * item.unitPrice)}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;background:#fff;color:#1a1a2e;font-size:13px;line-height:1.5}
    .page{max-width:760px;margin:0 auto;padding:48px 40px}
    .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px}
    .brand{font-size:22px;font-weight:700;color:#0A0C0F}.brand span{color:#00C287}
    .invoice-title{font-size:28px;font-weight:700;color:#0A0C0F;text-align:right}
    .invoice-num{font-size:13px;color:#7A8494;text-align:right;margin-top:4px}
    .divider{height:1px;background:#E8ECF0;margin:20px 0}
    .bill-row{display:flex;gap:40px;margin-bottom:28px}
    .bill-label{font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:#7A8494;margin-bottom:6px}
    .bill-name{font-size:15px;font-weight:600;color:#0A0C0F}
    .bill-detail{font-size:13px;color:#4A5568;margin-top:2px}
    table{width:100%;border-collapse:collapse;margin-bottom:20px}
    thead tr{background:#0A0C0F}
    thead th{padding:10px 12px;font-size:11px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;color:#A8B3C0;text-align:left}
    th.right,td.right{text-align:right} th.center,td.center{text-align:center}
    tbody tr{border-bottom:1px solid #F0F2F5}
    tbody tr:nth-child(even){background:#FAFBFC}
    td{padding:11px 12px;color:#1a1a2e}
    td.desc{font-weight:500}
    .totals{display:flex;justify-content:flex-end;margin-bottom:28px}
    .totals-table{width:280px}
    .total-row{display:flex;justify-content:space-between;padding:6px 0;font-size:13px;color:#4A5568}
    .total-row.grand{border-top:2px solid #0A0C0F;margin-top:4px;padding-top:10px}
    .total-row.grand .label{font-size:15px;font-weight:700;color:#0A0C0F}
    .total-row.grand .amount{font-size:18px;font-weight:700;color:#00C287}
    .footer{text-align:center;font-size:11px;color:#A8B3C0;padding-top:20px;border-top:1px solid #E8ECF0}
  </style></head><body><div class="page">
    <div class="header">
      <div><div class="brand">Forge<span>Front</span></div><div style="font-size:13px;color:#4A5568;margin-top:4px">${companyName}</div></div>
      <div><div class="invoice-title">INVOICE</div><div class="invoice-num">#${invoice.invoiceNumber}</div></div>
    </div>
    <div class="divider"></div>
    <div class="bill-row">
      <div><div class="bill-label">Bill To</div><div class="bill-name">${invoice.client}</div>${invoice.clientEmail ? `<div class="bill-detail">${invoice.clientEmail}</div>` : ''}</div>
      <div><div class="bill-label">Job</div><div class="bill-name">${invoice.jobName}</div></div>
      <div style="margin-left:auto;text-align:right">
        <div style="font-size:12px;color:#7A8494">Issue: ${format(new Date(invoice.issueDate), 'MMM d, yyyy')}</div>
        <div style="font-size:12px;color:#7A8494">Due: ${format(new Date(invoice.dueDate), 'MMM d, yyyy')}</div>
      </div>
    </div>
    <table><thead><tr><th style="width:50%">Description</th><th class="center" style="width:12%">Qty</th><th class="right" style="width:19%">Unit Price</th><th class="right" style="width:19%">Amount</th></tr></thead>
    <tbody>${lineItemRows}</tbody></table>
    <div class="totals"><div class="totals-table">
      <div class="total-row"><span>Subtotal</span><span>${formatCurrency(invoice.subtotal)}</span></div>
      ${invoice.taxRate > 0 ? `<div class="total-row"><span>Tax (${invoice.taxRate}%)</span><span>${formatCurrency(invoice.taxAmount)}</span></div>` : ''}
      <div class="total-row grand"><span class="label">Total Due</span><span class="amount">${formatCurrency(invoice.total)}</span></div>
    </div></div>
    ${invoice.notes ? `<div style="background:#F8F9FA;border-left:3px solid #00C287;padding:12px 16px;border-radius:4px;margin-bottom:28px"><div style="font-size:11px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;color:#7A8494;margin-bottom:4px">Notes</div><div style="font-size:13px;color:#4A5568">${invoice.notes}</div></div>` : ''}
    <div class="footer"><strong>Thank you for your business.</strong> — Payment due by ${format(new Date(invoice.dueDate), 'MMMM d, yyyy')}.<br/>Generated by ForgeFront · support@forgefront.app</div>
  </div></body></html>`;
}

// ─── Service ──────────────────────────────────────────────────────────────────
export class InvoiceService {
  static generateInvoiceNumber(): string {
    const year = new Date().getFullYear();
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `FF-${year}-${rand}`;
  }

  static calcTotals(
    lineItems: { quantity: number; unitPrice: number }[],
    taxRate: number
  ): { subtotal: number; taxAmount: number; total: number } {
    const subtotal = lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const taxAmount = parseFloat((subtotal * (taxRate / 100)).toFixed(2));
    const total = parseFloat((subtotal + taxAmount).toFixed(2));
    return { subtotal, taxAmount, total };
  }

  static async generateAndShare(invoice: Invoice, companyName: string): Promise<void> {
    const html = buildInvoiceHTML(invoice, companyName);

    if (Platform.OS === 'web') {
      // Web: open a new window with the invoice HTML and trigger print dialog
      const win = window.open('', '_blank');
      if (win) {
        win.document.write(html);
        win.document.close();
        win.focus();
        setTimeout(() => win.print(), 500);
      }
      return;
    }

    // Native: generate real PDF and open share sheet
    try {
      const Print = await import('expo-print');
      const Sharing = await import('expo-sharing');
      const FileSystem = await import('expo-file-system');

      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const destUri = `${FileSystem.documentDirectory}invoice_${invoice.invoiceNumber}.pdf`;
      await FileSystem.moveAsync({ from: uri, to: destUri });

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) throw new Error('Sharing is not available on this device.');
      await Sharing.shareAsync(destUri, {
        mimeType: 'application/pdf',
        dialogTitle: `Invoice ${invoice.invoiceNumber}`,
        UTI: 'com.adobe.pdf',
      });
    } catch (e: any) {
      console.error('[InvoiceService] Native PDF error:', e.message);
      throw e;
    }
  }

  static async printInvoice(invoice: Invoice, companyName: string): Promise<void> {
    const html = buildInvoiceHTML(invoice, companyName);

    if (Platform.OS === 'web') {
      const win = window.open('', '_blank');
      if (win) {
        win.document.write(html);
        win.document.close();
        win.focus();
        setTimeout(() => win.print(), 500);
      }
      return;
    }

    try {
      const Print = await import('expo-print');
      await Print.printAsync({ html });
    } catch (e: any) {
      console.error('[InvoiceService] Print error:', e.message);
      throw e;
    }
  }
}
