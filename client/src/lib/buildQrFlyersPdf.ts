import { jsPDF } from 'jspdf'
import QRCode from 'qrcode'

export type ClubQrFlyerPdfInput = {
  /** Data URL PNG du logo (ex. /logo-rosendael.png chargé en base64). */
  logoDataUrl: string | null
  tournamentName: string
  registrationUrl?: string
  liveMatchUrl?: string
  /** Sans extension .pdf */
  filenameBase: string
}

async function loadPublicImageDataUrl(pathFromRoot: string): Promise<string | null> {
  const url = `${window.location.origin}${pathFromRoot.startsWith('/') ? pathFromRoot : `/${pathFromRoot}`}`
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(r.result as string)
      r.onerror = () => reject(new Error('Lecture logo'))
      r.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

async function qrToPngDataUrl(text: string, darkHex: string): Promise<string> {
  return QRCode.toDataURL(text, {
    margin: 1,
    width: 640,
    color: { dark: darkHex, light: '#ffffff' },
    errorCorrectionLevel: 'H',
  })
}

/** Cercles décoratifs discrets (coins). */
function drawCornerOrbs(
  doc: jsPDF,
  W: number,
  pageH: number,
  rgb: { r: number; g: number; b: number },
  rgbLight: { r: number; g: number; b: number },
) {
  doc.setFillColor(rgbLight.r, rgbLight.g, rgbLight.b)
  doc.circle(-8, pageH * 0.35, 48, 'F')
  doc.circle(W + 12, pageH * 0.22, 56, 'F')
  doc.setFillColor(rgb.r, rgb.g, rgb.b)
  doc.circle(W - 8, pageH - 32, 38, 'F')
  doc.circle(14, pageH - 48, 28, 'F')
}

function drawRoseHero(doc: jsPDF, W: number) {
  doc.setFillColor(131, 24, 67)
  doc.rect(0, 0, W, 11, 'F')
  doc.setFillColor(190, 24, 93)
  doc.rect(0, 11, W, 10, 'F')
  doc.setFillColor(225, 29, 72)
  doc.rect(0, 21, W, 9, 'F')
  doc.setFillColor(251, 113, 133)
  doc.rect(0, 30, W, 4, 'F')
}

function drawEmeraldHero(doc: jsPDF, W: number) {
  doc.setFillColor(6, 78, 59)
  doc.rect(0, 0, W, 11, 'F')
  doc.setFillColor(5, 122, 85)
  doc.rect(0, 11, W, 10, 'F')
  doc.setFillColor(16, 185, 129)
  doc.rect(0, 21, W, 9, 'F')
  doc.setFillColor(110, 231, 183)
  doc.rect(0, 30, W, 4, 'F')
}

function drawLogoBadge(doc: jsPDF, W: number, cy: number, logo: string | null, strokeRgb: [number, number, number]) {
  const r = 19
  doc.setFillColor(255, 255, 255)
  doc.setDrawColor(strokeRgb[0], strokeRgb[1], strokeRgb[2])
  doc.setLineWidth(0.45)
  doc.circle(W / 2, cy, r, 'FD')

  const logoBox = 24
  const lx = W / 2 - logoBox / 2
  const ly = cy - logoBox / 2
  if (logo) {
    try {
      doc.addImage(logo, 'PNG', lx, ly, logoBox, logoBox, undefined, 'FAST')
    } catch {
      // ignore
    }
  }
}

function drawPillLabel(
  doc: jsPDF,
  W: number,
  y: number,
  label: string,
  fillRgb: [number, number, number],
  textRgb: [number, number, number],
) {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.2)
  const tw = doc.getTextWidth(label)
  const padX = 3.2
  const w = tw + padX * 2
  const h = 5.2
  const x = (W - w) / 2
  doc.setFillColor(fillRgb[0], fillRgb[1], fillRgb[2])
  doc.roundedRect(x, y - h + 1.2, w, h, 2.2, 2.2, 'F')
  doc.setTextColor(textRgb[0], textRgb[1], textRgb[2])
  doc.text(label, W / 2, y, { align: 'center' })
}

function drawQrCard(
  doc: jsPDF,
  W: number,
  topY: number,
  qrDataUrl: string,
  qrMm: number,
  accentStroke: [number, number, number],
) {
  const cardPad = 14
  const cardW = W - cardPad * 2
  const cardH = qrMm + 22
  const cardX = cardPad
  const shadowOff = 0.9

  doc.setFillColor(228, 228, 232)
  doc.roundedRect(cardX + shadowOff, topY + shadowOff, cardW, cardH, 5, 5, 'F')

  doc.setFillColor(255, 255, 255)
  doc.setDrawColor(accentStroke[0], accentStroke[1], accentStroke[2])
  doc.setLineWidth(0.55)
  doc.roundedRect(cardX, topY, cardW, cardH, 5, 5, 'FD')

  const qx = (W - qrMm) / 2
  const qy = topY + 10
  doc.addImage(qrDataUrl, 'PNG', qx, qy, qrMm, qrMm)

  doc.setDrawColor(245, 245, 248)
  doc.setLineWidth(0.25)
  doc.roundedRect(qx - 2.5, qy - 2.5, qrMm + 5, qrMm + 5, 1.8, 1.8, 'S')
}

function drawInscriptionPage(
  doc: jsPDF,
  W: number,
  pageH: number,
  logo: string | null,
  tournamentName: string,
  qrDataUrl: string,
) {
  doc.setFillColor(255, 247, 248)
  doc.rect(0, 0, W, pageH, 'F')
  drawCornerOrbs(
    doc,
    W,
    pageH,
    { r: 253, g: 206, b: 214 },
    { r: 255, g: 228, b: 232 },
  )
  drawRoseHero(doc, W)

  const logoCy = 19
  drawLogoBadge(doc, W, logoCy, logo, [225, 29, 72])

  drawPillLabel(doc, W, 47, 'INSCRIPTION', [225, 29, 72], [255, 255, 255])

  doc.setTextColor(88, 28, 46)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(17.5)
  doc.text("SCANNE POUR T'INSCRIRE", W / 2, 58, { align: 'center' })
  doc.setFontSize(14.2)
  doc.setTextColor(136, 19, 55)
  doc.text('AU PROCHAIN TOURNOI', W / 2, 67.5, { align: 'center' })

  let nextY = 74
  if (tournamentName.trim()) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10.2)
    doc.setTextColor(71, 71, 82)
    const boxPad = 16
    const maxW = W - boxPad * 2
    const lines = doc.splitTextToSize(tournamentName.trim(), maxW - 10)
    const lineH = 4.6
    const boxH = Math.max(10, lines.length * lineH + 8)
    const boxY = nextY
    doc.setFillColor(255, 255, 255)
    doc.setDrawColor(251, 191, 201)
    doc.setLineWidth(0.35)
    doc.roundedRect(boxPad, boxY, maxW, boxH, 3.5, 3.5, 'FD')
    doc.text(lines as string[], W / 2, boxY + 6.5 + lineH * 0.35, { align: 'center' })
    nextY = boxY + boxH + 7
  } else {
    nextY += 4
  }

  const qrMm = 64
  drawQrCard(doc, W, nextY, qrDataUrl, qrMm, [225, 29, 72])

  doc.setDrawColor(251, 191, 201)
  doc.setLineWidth(0.2)
  doc.line(28, pageH - 22, W - 28, pageH - 22)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(120, 113, 118)
  doc.text('FC Rosendael — tournois club', W / 2, pageH - 14, { align: 'center' })
  doc.setFontSize(7.2)
  doc.setTextColor(160, 150, 155)
  doc.text('À partager en salle ou sur les réseaux', W / 2, pageH - 9, { align: 'center' })
}

function drawLivePage(doc: jsPDF, W: number, pageH: number, logo: string | null, qrDataUrl: string) {
  doc.setFillColor(240, 253, 247)
  doc.rect(0, 0, W, pageH, 'F')
  drawCornerOrbs(
    doc,
    W,
    pageH,
    { r: 167, g: 243, b: 208 },
    { r: 209, g: 250, b: 229 },
  )
  drawEmeraldHero(doc, W)

  drawLogoBadge(doc, W, 19, logo, [16, 185, 129])

  drawPillLabel(doc, W, 47, 'MATCH EN DIRECT', [5, 122, 85], [255, 255, 255])

  doc.setTextColor(6, 78, 59)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(19.5)
  doc.text('VOIR LE MATCH', W / 2, 59, { align: 'center' })
  doc.setFontSize(20.5)
  doc.setTextColor(5, 46, 22)
  doc.text('EN DIRECT', W / 2, 70, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.2)
  doc.setTextColor(55, 95, 75)
  doc.text('Scanne le code : la page du tournoi s’ouvre sur le bandeau live.', W / 2, 80, {
    align: 'center',
    maxWidth: W - 44,
  })

  const qrMm = 64
  drawQrCard(doc, W, 92, qrDataUrl, qrMm, [5, 150, 105])

  doc.setDrawColor(167, 243, 208)
  doc.setLineWidth(0.2)
  doc.line(28, pageH - 22, W - 28, pageH - 22)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(70, 95, 82)
  doc.text('FC Rosendael — diffusion du direct', W / 2, pageH - 14, { align: 'center' })
  doc.setFontSize(7.2)
  doc.setTextColor(130, 150, 138)
  doc.text('Pense à un bon éclairage pour le scan', W / 2, pageH - 9, { align: 'center' })
}

/**
 * PDF A4 : une page « inscription » si URL fournie, une page « match en direct » si URL fournie.
 * Logo + couleurs club (rose / vert).
 */
export async function downloadClubQrFlyersPdf(input: ClubQrFlyerPdfInput): Promise<void> {
  const hasReg = Boolean(input.registrationUrl?.trim())
  const hasLive = Boolean(input.liveMatchUrl?.trim())
  if (!hasReg && !hasLive) {
    throw new Error('Aucun contenu pour le flyer (inscription fermée et pas de direct).')
  }

  let logo = input.logoDataUrl
  if (!logo) {
    logo = await loadPublicImageDataUrl('/logo-rosendael.png')
  }

  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  const W = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()

  if (hasReg) {
    const qr = await qrToPngDataUrl(input.registrationUrl!.trim(), '#881337')
    drawInscriptionPage(doc, W, pageH, logo, input.tournamentName, qr)
  }
  if (hasLive) {
    if (hasReg) doc.addPage()
    const qr = await qrToPngDataUrl(input.liveMatchUrl!.trim(), '#064e3b')
    drawLivePage(doc, W, pageH, logo, qr)
  }

  const blob = doc.output('blob')
  const a = document.createElement('a')
  const href = URL.createObjectURL(blob)
  a.href = href
  a.download = `${input.filenameBase.replace(/\.pdf$/i, '')}.pdf`
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(href), 1500)
}
