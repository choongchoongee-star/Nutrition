export const getImageMetadata = async () => null;

/**
 * JPEG EXIF 파서 (의존성 없음)
 * Safari는 iPhone HEIC 업로드 시 JPEG으로 자동 변환하므로 JPEG 파싱으로 충분.
 *
 * 우선순위: DateTimeOriginal(0x9003) > DateTimeDigitized(0x9004) > DateTime(0x0132)
 */
const readExifDate = async (blob) => {
  try {
    const buf = await blob.arrayBuffer();
    const v = new DataView(buf);

    if (v.getUint16(0) !== 0xFFD8) return null; // JPEG 아님

    let pos = 2;
    while (pos < v.byteLength - 4) {
      if (v.getUint8(pos) !== 0xFF) break;
      const marker = v.getUint8(pos + 1);
      pos += 2;

      if (marker === 0xE1) { // APP1
        const segEnd = pos + v.getUint16(pos);
        pos += 2;
        // "Exif" 헤더 확인 (0x45786966)
        if (v.getUint32(pos) !== 0x45786966) { pos = segEnd; continue; }
        pos += 6; // "Exif\0\0" 건너뜀

        const tiff = pos;
        const le = v.getUint16(tiff) === 0x4949; // 리틀엔디안 여부

        // IFD 파싱 → { tag: value/offset } 맵 반환
        const parseIfd = (start) => {
          const count = v.getUint16(start, le);
          const tags = {};
          for (let i = 0; i < count; i++) {
            const o = start + 2 + i * 12;
            tags[v.getUint16(o, le)] = v.getUint32(o + 8, le);
          }
          return tags;
        };

        // TIFF 오프셋 기준 ASCII 문자열 읽기
        const readStr = (offset) => {
          let s = '';
          for (let j = 0; j < 19; j++) {
            const c = v.getUint8(tiff + offset + j);
            if (c === 0) break;
            s += String.fromCharCode(c);
          }
          return s;
        };

        // "YYYY:MM:DD HH:MM:SS" → "YYYY-MM-DD"
        const toDate = (raw) =>
          raw ? raw.replace(/^(\d{4}):(\d{2}):(\d{2}).*$/, '$1-$2-$3') : null;

        const ifd0 = parseIfd(tiff + v.getUint32(tiff + 4, le));

        // ExifIFD에서 DateTimeOriginal / DateTimeDigitized 우선 탐색
        if (ifd0[0x8769]) {
          const exif = parseIfd(tiff + ifd0[0x8769]);
          if (exif[0x9003]) return toDate(readStr(exif[0x9003]));
          if (exif[0x9004]) return toDate(readStr(exif[0x9004]));
        }

        // IFD0의 DateTime으로 폴백
        if (ifd0[0x0132]) return toDate(readStr(ifd0[0x0132]));

        return null;

      } else if (marker === 0xD9 || marker === 0xDA) {
        break; // EOI / SOS
      } else {
        pos += v.getUint16(pos);
      }
    }
  } catch (e) {
    console.error('EXIF read error:', e);
  }
  return null;
};

export const extractDateFromUri = async (uri) => {
  try {
    const res = await fetch(uri);
    const blob = await res.blob();
    return await readExifDate(blob);
  } catch (e) {
    return null;
  }
};

export const suggestMealType = (hour) => {
  if (hour >= 5 && hour < 11) return "Breakfast";
  if (hour >= 11 && hour < 15) return "Lunch";
  if (hour >= 17 && hour < 21) return "Dinner";
  return "Snack";
};

export const formatDate = (date) => {
  const d = new Date(date);
  let month = '' + (d.getMonth() + 1);
  let day = '' + d.getDate();
  const year = d.getFullYear();
  if (month.length < 2) month = '0' + month;
  if (day.length < 2) day = '0' + day;
  return [year, month, day].join('-');
};
