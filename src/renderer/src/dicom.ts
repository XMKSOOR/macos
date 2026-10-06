import * as dicomParser from 'dicom-parser'

/** نتيجة فكّ ترميز ملف DICOM: إما تدرّج رمادي، أو صورة RGB، أو إطار JPEG مضغوط يسلكه المتصفح. */
export type DicomDecoded =
  | {
      kind: 'gray'
      width: number
      height: number
      pixels: Float32Array
      min: number
      max: number
      center: number
      width0: number
      frame: number
      frameCount: number
      meta: Record<string, string>
    }
  | {
      kind: 'rgba'
      width: number
      height: number
      rgba: Uint8ClampedArray
      frame: number
      frameCount: number
      meta: Record<string, string>
    }
  | { kind: 'jpeg'; blob: Blob; frame: number; frameCount: number; meta: Record<string, string> }

/** تحويل data URL (base64) إلى بايتات */
export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(',')
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

const COMPRESSED_JPEG = new Set([
  '1.2.840.10008.1.2.4.50', // JPEG baseline
  '1.2.840.10008.1.2.4.51', // JPEG extended
  '1.2.840.10008.1.2.4.57', // JPEG lossless
  '1.2.840.10008.1.2.4.70' // JPEG lossless SV1
])

function metaOf(ds: dicomParser.DataSet): Record<string, string> {
  const meta: Record<string, string> = {}
  const put = (label: string, tag: string): void => {
    const v = ds.string(tag)
    if (v && v.trim()) meta[label] = v.trim()
  }
  put('اسم المريض', 'x00100010')
  put('رقم المريض', 'x00100020')
  put('تاريخ الفحص', 'x00080020')
  put('الوصف', 'x0008103e')
  put('الجهاز', 'x00080070')
  put('الجسم', 'x00180015')
  put('النافذة', 'x00281050')
  meta['صيغة النقل'] = ds.string('x00020010') ?? ''
  return meta
}

function dsNumber(ds: dicomParser.DataSet, tag: string, fallback = 0): number {
  const raw = ds.string(tag)
  if (raw) {
    const n = parseFloat(raw.split('\\')[0])
    if (Number.isFinite(n)) return n
  }
  return ds.float(tag) ?? ds.uint16(tag) ?? fallback
}

/**
 * يفكّ ترميز ملف DICOM ويعيد بيانات قابلة للعرض.
 * يدعم: الصور غير المضغوطة (رمادي 8/16 بت و RGB 8 بت)، وإطارات JPEG المضمّنة.
 */
export function decodeDicom(bytes: Uint8Array, frame = 0): DicomDecoded {
  const ds = dicomParser.parseDicom(bytes)
  const meta = metaOf(ds)
  const width = ds.uint16('x00280011') ?? 0
  const height = ds.uint16('x00280010') ?? 0
  if (!width || !height) throw new Error('أبعاد صورة الأشعة غير متاحة')
  let frameCount = parseInt(ds.string('x00280008') ?? '1', 10)
  if (!Number.isFinite(frameCount) || frameCount < 1) frameCount = 1
  const f = Math.min(Math.max(0, frame), frameCount - 1)

  const pd = ds.elements['x7fe00010']
  if (!pd) throw new Error('ملف الأشعة لا يحتوي على بيانات بكسل')
  const ts = (ds.string('x00020010') ?? '').trim()
  const bits = ds.uint16('x00280100') ?? 8
  const spp = ds.uint16('x00280002') ?? 1
  const signed = ds.uint16('x00280103') === 1

  // ---- إطار مضغوط (JPEG) ----
  if (pd.encapsulatedPixelData || ts.startsWith('1.2.840.10008.1.2.4')) {
    if (!COMPRESSED_JPEG.has(ts)) {
      throw new Error('صيغة ضغط صورة الأشعة غير مدعومة للعرض المباشر — استخدم "فتح بالبرنامج الافتراضي"')
    }
    const frameBytes = dicomParser.readEncapsulatedImageFrame(ds, pd, f) as Uint8Array
    const blob = new Blob([frameBytes as unknown as BlobPart], { type: 'image/jpeg' })
    return { kind: 'jpeg', blob, frame: f, frameCount, meta }
  }

  // ---- بيانات غير مضغوطة ----
  const byteArray = ds.byteArray as Uint8Array
  const perFrame = Math.floor(pd.length / frameCount)
  const offset = pd.dataOffset + f * perFrame
  const view = new DataView(byteArray.buffer, byteArray.byteOffset + offset, perFrame)
  const little = ts !== '1.2.840.10008.1.2.2'
  const photo = (ds.string('x00280004') ?? '').trim().toUpperCase()

  if (spp >= 3) {
    const rgba = new Uint8ClampedArray(width * height * 4)
    const step = bits === 16 ? 2 : 1
    for (let i = 0; i < width * height; i++) {
      const r = step === 2 ? view.getUint16(i * 6, little) >> 8 : view.getUint8(i * 3)
      const g = step === 2 ? view.getUint16(i * 6 + 2, little) >> 8 : view.getUint8(i * 3 + 1)
      const b = step === 2 ? view.getUint16(i * 6 + 4, little) >> 8 : view.getUint8(i * 3 + 2)
      rgba[i * 4] = r
      rgba[i * 4 + 1] = g
      rgba[i * 4 + 2] = b
      rgba[i * 4 + 3] = 255
    }
    return { kind: 'rgba', width, height, rgba, frame: f, frameCount, meta }
  }

  const slope = dsNumber(ds, 'x00281053', 1) || 1
  const intercept = dsNumber(ds, 'x00281052', 0)
  const pixels = new Float32Array(width * height)
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < width * height; i++) {
    let v: number
    if (bits === 16) v = signed ? view.getInt16(i * 2, little) : view.getUint16(i * 2, little)
    else v = view.getUint8(i)
    v = v * slope + intercept
    pixels[i] = v
    if (v < min) min = v
    if (v > max) max = v
  }
  if (!Number.isFinite(min)) {
    min = 0
    max = 1
  }
  if (max <= min) max = min + 1
  const hasWC = ds.string('x00281050') !== undefined
  const dw = hasWC ? dsNumber(ds, 'x00281051', max - min) : max - min
  const dc = hasWC ? dsNumber(ds, 'x00281050', (min + max) / 2) : (min + max) / 2
  return {
    kind: 'gray',
    width,
    height,
    pixels,
    min,
    max,
    center: dc,
    width0: dw,
    frame: f,
    frameCount,
    meta
  }
}

/** يطبّق النافذة/المستوى (Window/Level) على قيم رمادية ويعيد RGBA جاهزة للرسم */
export function windowToRgba(pixels: Float32Array, center: number, width: number, invert = false): Uint8ClampedArray {
  const out = new Uint8ClampedArray(pixels.length * 4)
  const half = Math.max(1, width) / 2
  const lo = center - half
  const hi = center + half
  const span = hi - lo || 1
  for (let i = 0; i < pixels.length; i++) {
    let t = (pixels[i] - lo) / span
    if (t < 0) t = 0
    else if (t > 1) t = 1
    let g = Math.round(t * 255)
    if (invert) g = 255 - g
    out[i * 4] = g
    out[i * 4 + 1] = g
    out[i * 4 + 2] = g
    out[i * 4 + 3] = 255
  }
  return out
}