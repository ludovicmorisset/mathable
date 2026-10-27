function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]))}

function createEmailHtml({title,message,details=[]}){
  const rows=details.map(([label,value])=>`<tr><td style="padding:12px 14px;border-bottom:1px solid #dce5e2;color:#687985;font-size:13px">${escapeHtml(label)}</td><td style="padding:12px 14px;border-bottom:1px solid #dce5e2;color:#172b3a;font-size:14px;font-weight:700;text-align:right">${escapeHtml(value)}</td></tr>`).join('');
  return `<!doctype html><html lang="fr"><body style="margin:0;padding:32px 12px;background:#f3f7fc;color:#172b3a;font-family:Arial,Helvetica,sans-serif"><table role="presentation" style="width:100%;max-width:600px;margin:0 auto;border-collapse:collapse"><tr><td style="padding:18px 24px;background:#1565c0;color:#fff;border-radius:16px 16px 0 0"><span style="display:inline-block;width:34px;height:34px;margin-right:10px;border-radius:10px;background:#fff;color:#1565c0;font-size:22px;font-weight:700;line-height:34px;text-align:center;vertical-align:middle">M</span><span style="font-size:17px;font-weight:700;letter-spacing:1px;vertical-align:middle">MATHABLE</span></td></tr><tr><td style="padding:30px 28px;background:#fff;border:1px solid #d9e5f1;border-top:0;border-radius:0 0 16px 16px"><p style="margin:0 0 10px;color:#087f65;font-size:11px;font-weight:700;letter-spacing:1.3px;text-transform:uppercase">Mathable en ligne</p><h1 style="margin:0 0 14px;color:#172b3a;font-size:26px;line-height:1.2">${escapeHtml(title)}</h1><p style="margin:0 0 22px;color:#526574;font-size:15px;line-height:1.6">${escapeHtml(message)}</p>${rows?`<table role="presentation" style="width:100%;margin:0 0 20px;border:1px solid #dce5e2;border-radius:10px;border-spacing:0;overflow:hidden">${rows}</table>`:''}<p style="margin:24px 0 0;color:#687985;font-size:12px;line-height:1.5">À bientôt autour du plateau,<br><strong style="color:#172b3a">L’équipe Mathable</strong></p></td></tr></table></body></html>`;
}

async function createTransport(){
  const nodemailer=(await import('nodemailer')).default;
  return nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:Number(process.env.SMTP_PORT)===465,auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}});
}

export async function sendBrandedEmail({to,subject,title,message,details=[]}){
  const text=[title,message,...details.map(([label,value])=>`${label} : ${value}`),'L’équipe Mathable'].join('\n\n');
  if(!process.env.SMTP_HOST){console.log(`[DEV] Email Mathable : ${subject}`);return false}
  const transport=await createTransport();
  await transport.sendMail({from:process.env.SMTP_FROM,to,subject,text,html:createEmailHtml({title,message,details})});
  return true;
}

export async function sendCodeEmail(email,code,{subject='Votre code Mathable',title='Votre code de vérification',message='Utilisez ce code pour continuer. Il expire dans 15 minutes.'}={}){
  const result=await sendBrandedEmail({to:email,subject,title,message,details:[['Code',code]]});
  return !result;
}
