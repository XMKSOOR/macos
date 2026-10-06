import { useEffect, useRef, useState } from 'react'
import { Modal } from './ui'
import type { PatientAttachment } from './lib'
import type { DicomDecoded } from './dicom'
import { dataUrlToBytes, decodeDicom, windowToRgba } from './dicom'

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

function fmtSize(n: number): string {
  if (n < 1024) return `${n} بايت`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} ك.ب`
  return `${(n / 1024 / 1024).toFixed(2)} م.ب`
}

export default function AttachmentViewer({
  attachment,
  onClose
}: {
  attachment: PatientAttachment
  onClose: () => void
}): React.JSX.Element {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [decoded, setDecoded] = useState<DicomDecoded | null>(null)
  const [jpegUrl, setJpegUrl] = useState('')
  const [error, setError] = useState('')
  const [frame, setFrame] = useState(0)
  const [center, setCenter] = useState(0)
  const [width, setWidth] = useState(0)
  const [invert, setInvert] = useState(false)
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)

  const isDicom = attachment.ftype === 'dicom'

  // تحميل محتوى الملف كـ data URL
  useEffect(() => {
    let alive = true
    setDataUrl(null)
    setDecoded(null)
    setJpegUrl('')
    setError('')
    setFrame(0)
    setScale(1)
    setOffset({ x: 0, y: 0 })
    window.clinic.attachments
      .read(attachment.id)
      .then((r) => {
        if (alive) setDataUrl(r.dataUrl)
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      alive = false
    }
  }, [attachment.id])

  // فكّ ترميز DICOM
  useEffect(() => {
    if (!dataUrl || !isDicom) return
    try {
      const dec = decodeDicom(dataUrlToBytes(dataUrl), frame)
      setDecoded(dec)
      if (dec.kind === 'gray') {
        setCenter(dec.center)
        setWidth(dec.width0)
      }
      if (dec.kind === 'jpeg') {
        const url = URL.createObjectURL(dec.blob)
        setJpegUrl(url)
        return () => URL.revokeObjectURL(url)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [dataUrl, frame, isDicom])

  // رسم الصورة الرمادية على الـ canvas مع النافذة/المستوى
  useEffect(() => {
    if (!decoded || decoded.kind !== 'gray' || !canvasRef.current) return
    const c = canvasRef.current
    c.width = decoded.width
    c.height = decoded.height
    const ctx = c.getContext('2d')
    if (!ctx) return
    const rgba = windowToRgba(decoded.pixels, center, width, invert)
    const img = ctx.createImageData(decoded.width, decoded.height)
    img.data.set(rgba)
    ctx.putImageData(img, 0, 0)
  }, [decoded, center, width, invert])

  const resetView = (): void => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }

  const onWheel = (e: React.WheelEvent): void => {
    setScale((s) => clamp(s * (e.deltaY < 0 ? 1.15 : 0.87), 0.1, 10))
  }

  const onMouseDown = (e: React.MouseEvent): void => {
    dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }
    const move = (ev: MouseEvent): void => {
      const d = dragRef.current
      if (!d) return
      setOffset({ x: d.ox + (ev.clientX - d.x), y: d.oy + (ev.clientY - d.y) })
    }
    const up = (): void => {
      dragRef.current = null
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  const frameCount = decoded?.frameCount ?? 1
  const meta: Record<string, string> = decoded?.meta ?? {}
  const showImage = !isDicom && dataUrl
  const showCanvas = decoded?.kind === 'gray'
  const showJpeg = decoded?.kind === 'jpeg' && jpegUrl
  const showRgba = decoded?.kind === 'rgba'

  const openExternal = (): void => {
    window.clinic.attachments.openExternal(attachment.id).catch((e) => setError(e.message))
  }

  return (
    <Modal
      title={`عارض: ${attachment.filename}`}
      onClose={onClose}
      full
      footer={
        <div className="viewer-foot">
          <div className="flex">
            <button className="soft small" onClick={() => setScale((s) => clamp(s * 1.2, 0.1, 10))}>
              ＋
            </button>
            <button className="soft small" onClick={() => setScale((s) => clamp(s / 1.2, 0.1, 10))}>
              －
            </button>
            <button className="ghost small" onClick={resetView}>
              ملاءمة
            </button>
            {decoded?.kind === 'gray' && (
              <button className="ghost small" onClick={() => setInvert((v) => !v)}>
                {invert ? 'عكس (مفعّل)' : 'عكس الألوان'}
              </button>
            )}
            {frameCount > 1 && (
              <span className="flex">
                <button className="soft small" disabled={frame <= 0} onClick={() => setFrame((f) => Math.max(0, f - 1))}>
                  ‹
                </button>
                <span className="muted">
                  {frame + 1} / {frameCount}
                </span>
                <button
                  className="soft small"
                  disabled={frame >= frameCount - 1}
                  onClick={() => setFrame((f) => Math.min(frameCount - 1, f + 1))}
                >
                  ›
                </button>
              </span>
            )}
          </div>
          <div className="flex">
            <button className="ghost small" onClick={openExternal}>
              فتح بالبرنامج الافتراضي
            </button>
            <button className="ghost small" onClick={onClose}>
              إغلاق
            </button>
          </div>
        </div>
      }
    >
      {error && <div className="inline-err">{error}</div>}
      {!dataUrl && !error && <div className="muted">جاري التحميل...</div>}

      {dataUrl && (
        <div className="viewer">
          <div className="viewer-stage" onWheel={onWheel} onMouseDown={onMouseDown}>
            {showCanvas && (
              <canvas
                ref={canvasRef}
                className="viewer-media"
                style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
              />
            )}
            {showRgba && decoded?.kind === 'rgba' && (
              <RgbaCanvas width={decoded.width} height={decoded.height} rgba={decoded.rgba} transform={`translate(${offset.x}px, ${offset.y}px) scale(${scale})`} />
            )}
            {(showImage || showJpeg) && (
              <img
                className="viewer-media"
                src={showJpeg ? jpegUrl : (dataUrl as string)}
                alt={attachment.filename}
                style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
              />
            )}
            {isDicom && !showCanvas && !showRgba && !showJpeg && !error && (
              <div className="muted">جاري تحضير صورة الأشعة...</div>
            )}
            {!isDicom && !showImage && !error && <div className="muted">جاري التحميل...</div>}
          </div>

          <div className="viewer-side">
            {decoded?.kind === 'gray' && (
              <>
                <div className="field">
                  <label>
                    السطوع (النافذة) — {Math.round(center)}
                    <input
                      type="range"
                      min={Math.round(decoded.min)}
                      max={Math.round(decoded.max)}
                      value={center}
                      onChange={(e) => setCenter(Number(e.target.value))}
                    />
                  </label>
                </div>
                <div className="field">
                  <label>
                    التباين (المستوى) — {Math.round(width)}
                    <input
                      type="range"
                      min={1}
                      max={Math.max(2, Math.round(decoded.max - decoded.min))}
                      value={width}
                      onChange={(e) => setWidth(Number(e.target.value))}
                    />
                  </label>
                </div>
              </>
            )}
            <div className="viewer-meta">
              <div className="row">
                <span className="k">النوع</span>
                <span className="v">
                  {attachment.ftype === 'dicom' ? 'صورة أشعة (DICOM)' : attachment.ftype === 'image' ? 'صورة' : 'ملف'}
                </span>
              </div>
              <div className="row">
                <span className="k">الحجم</span>
                <span className="v">{fmtSize(attachment.size)}</span>
              </div>
              {Object.entries(meta)
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div className="row" key={k}>
                    <span className="k">{k}</span>
                    <span className="v">{v}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

function RgbaCanvas({
  width,
  height,
  rgba,
  transform
}: {
  width: number
  height: number
  rgba: Uint8ClampedArray
  transform: string
}): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    c.width = width
    c.height = height
    const ctx = c.getContext('2d')
    if (ctx) {
      const img = ctx.createImageData(width, height)
      img.data.set(rgba)
      ctx.putImageData(img, 0, 0)
    }
  }, [width, height, rgba])
  return <canvas ref={ref} className="viewer-media" style={{ transform }} />
}