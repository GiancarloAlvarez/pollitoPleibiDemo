import { escapeHtml, money, formatDateTime } from '../core/utils.js';
import { openModal } from './modal.js';

export function receiptMarkup(order, seller) {
  const business = order.receipt_business || {};
  const e = escapeHtml;
  return `<article class="commercial-receipt">
    <header><h2>${e(business.business_name || 'Pollito Pleibi')}</h2>
      <p>${e(business.address || '')}<br>${e(business.phone || '')}</p>
      ${business.rnc ? `<p>RNC: ${e(business.rnc)}</p>` : ''}
      <h3>Comprobante comercial</h3><p>No válido como comprobante fiscal</p></header>
    <p><b>Orden ${e(order.code)}</b><br>${e(formatDateTime(order.created_at))}<br>
      Cliente: ${e(order.customer)}<br>Atendido por: ${e(order.seller_name || seller || 'Sin atribución histórica')}<br>
      Caja: ${e(order.local_cash_session_id || order.cash_session_id || 'No registrada')}
      ${order.demo_sale ? '<br><b>DEMOSTRACIÓN — SIN VALOR COMERCIAL</b>' : ''}</p>
    <table><thead><tr><th>Producto</th><th>Cant.</th><th>Precio</th><th>Importe</th></tr></thead>
      <tbody>${(order.items || []).map(item => `<tr><td>${e(item.name)}</td><td>${e(String(item.qty))}</td><td>${money(item.price)}</td><td>${money(item.price * item.qty)}</td></tr>`).join('')}</tbody></table>
    <p>Subtotal: ${money(order.subtotal)}${order.discount ? `<br>Descuento: ${money(order.discount)}` : ''}<br>ITBIS: ${money(order.tax)}${order.tip ? `<br>Propina: ${money(order.tip)}` : ''}<br><b>Total: ${money(order.total)}</b></p>
    <p>${order.paid ? `Pago registrado: ${e(order.payment_method)}` : 'PENDIENTE DE PAGO'}
      ${order.amount_received != null ? `<br>Recibido: ${money(order.amount_received)}<br>Cambio: ${money(order.change_due)}` : ''}</p>
    <footer>Gracias por su compra.</footer>
  </article>`;
}

export function cashCloseMarkup(session, summary, seller) {
  const e = escapeHtml;
  const business = session.business || {};
  const difference = Number(summary.diferencia) || 0;
  return `<article class="commercial-receipt cash-close-receipt">
    <header><h2>${e(business.business_name || 'Pollito Pleibi')}</h2>
      <p>${e(business.address || '')}<br>${e(business.phone || '')}</p>
      ${business.rnc ? `<p>RNC: ${e(business.rnc)}</p>` : ''}
      <h3>Cierre de caja (Z)</h3><p>Documento comercial, no fiscal</p></header>
    <p><b>Caja ${e(String(session.id || '').slice(0, 8).toUpperCase())}</b><br>
      Responsable: ${e(seller || 'Sin atribución')}<br>
      Apertura: ${e(formatDateTime(summary.fecha_apertura))}<br>
      Cierre: ${e(formatDateTime(summary.fecha_cierre))}
      ${session.demo ? '<br><b>DEMOSTRACIÓN — SIN VALOR COMERCIAL</b>' : ''}</p>
    <table><tbody>
      <tr><td>Fondo inicial</td><td>${money(summary.monto_inicial)}</td></tr>
      <tr><td>Cobros en efectivo</td><td>${money(summary.cobros_efectivo)}</td></tr>
      <tr><td>Entradas de efectivo</td><td>${money(summary.entradas)}</td></tr>
      <tr><td>Retiros</td><td>${money(summary.retiros)}</td></tr>
      <tr><td>Gastos pagados de caja</td><td>${money(summary.gastos_caja)}</td></tr>
      <tr><td><b>Efectivo esperado</b></td><td><b>${money(summary.esperado)}</b></td></tr>
      <tr><td>Efectivo declarado</td><td>${money(summary.monto_declarado)}</td></tr>
      <tr><td><b>Diferencia</b></td><td><b>${difference === 0 ? 'Cuadra' : money(difference)}</b></td></tr>
    </tbody></table>
    ${summary.propinas_efectivo ? `<p>Propinas en efectivo incluidas en los cobros: ${money(summary.propinas_efectivo)}</p>` : ''}
    ${summary.notas ? `<p>Notas: ${e(summary.notas)}</p>` : ''}
    <footer>Arqueo conservado para consulta. No modifica ventas ni pagos.</footer>
  </article>`;
}

export function showCashClose(session, summary, business, seller) {
  const withBusiness = { ...session, business };
  const markup = cashCloseMarkup(withBusiness, summary, seller);
  openModal({
    title: 'Cierre de caja', description: 'Revisa el arqueo e imprime el cierre Z. El cierre ya quedó registrado.',
    body: `<label>Formato<select name="paper"><option value="80">Ticket 80 mm</option><option value="58">Ticket 58 mm</option><option value="a4">A4</option></select></label>${markup}`,
    confirmLabel: 'Imprimir Z',
    cancelLabel: 'Cerrar',
    onConfirm: data => {
      const paper = ['58', '80'].includes(String(data.get('paper'))) ? String(data.get('paper')) : 'a4';
      document.getElementById('cash-close-print-frame')?.remove();
      const frame = document.createElement('iframe');
      frame.id = 'cash-close-print-frame'; frame.title = 'Impresión del cierre de caja';
      frame.style.cssText = 'position:fixed;width:1px;height:1px;left:-10000px;border:0';
      frame.srcdoc = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Cierre de caja</title>
        <style>@page{size:${paper === 'a4' ? 'A4' : `${paper}mm auto`};margin:4mm}body{font:12px Arial,sans-serif;color:#111;background:white;margin:0}.commercial-receipt{max-width:${paper === 'a4' ? '190mm' : `${Number(paper) - 8}mm`};margin:auto;overflow-wrap:anywhere}h2,h3,p{margin:8px 0}header,footer{text-align:center}table{width:100%;border-collapse:collapse;font-size:11px}th,td{text-align:right;padding:4px 1px;border-bottom:1px solid #aaa}td:first-child{text-align:left}</style></head><body>${markup}</body></html>`;
      frame.onload = () => { frame.contentWindow.focus(); frame.contentWindow.print(); };
      document.body.appendChild(frame);
      return false;
    },
  });
}

export function showReceipt(order, seller) {
  if (!order.items?.length) throw new Error('La orden no tiene detalles completos para imprimir.');
  const markup = receiptMarkup(order, seller);
  openModal({ title: 'Comprobante comercial', description: 'Imprimir o guardar como PDF desde el navegador. Reimprimir no registra otra venta.',
    body: `<label>Formato<select name="paper"><option value="80">Ticket 80 mm</option><option value="58">Ticket 58 mm</option><option value="a4">A4</option></select></label>${markup}`,
    confirmLabel: 'Imprimir',
    onConfirm: data => {
      const paper = ['58', '80'].includes(data.get('paper')) ? data.get('paper') : 'a4';
      document.getElementById('receipt-print-frame')?.remove();
      const frame = document.createElement('iframe');
      frame.id = 'receipt-print-frame'; frame.title = 'Impresión del comprobante';
      frame.style.cssText = 'position:fixed;width:1px;height:1px;left:-10000px;border:0';
      frame.srcdoc = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Comprobante ${escapeHtml(order.code)}</title>
        <style>@page{size:${paper === 'a4' ? 'A4' : `${paper}mm auto`};margin:4mm}body{font:12px Arial,sans-serif;color:#111;background:white;margin:0}.commercial-receipt{max-width:${paper === 'a4' ? '190mm' : `${Number(paper) - 8}mm`};margin:auto;overflow-wrap:anywhere}h2,h3,p{margin:8px 0}header,footer{text-align:center}table{width:100%;border-collapse:collapse;font-size:10px}th,td{text-align:right;padding:4px 1px;border-bottom:1px solid #aaa}th:first-child,td:first-child{text-align:left}</style></head><body>${markup}</body></html>`;
      frame.onload = () => { frame.contentWindow.focus(); frame.contentWindow.print(); };
      document.body.appendChild(frame);
      return false;
    },
  });
}
