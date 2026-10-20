/** data.go.kr 파일데이터 다운로드(로그인 불필요): 파일 ID 조회(POST) → 파일 GET. 2026-10-20 실측 경로. */
const BASE = 'https://www.data.go.kr';
const UA = 'imjang-on/1.0 (+https://imjangon.co.kr)';

export const SCHOOL_ZONE_DATASETS = {
  zone: { publicDataPk: '15099520', detailPk: 'uddi:fa9f0432-91a3-4cfa-99ea-beb854b7a487' },
  link: { publicDataPk: '15099521', detailPk: 'uddi:a06c5780-ca78-482f-995e-f088a57c3b0b' },
} as const;

export async function downloadFileData(ds: { publicDataPk: string; detailPk: string }): Promise<Uint8Array> {
  const referer = `${BASE}/data/${ds.publicDataPk}/fileData.do`;
  const res = await fetch(`${BASE}/tcs/dss/selectFileDataDownload.do`, {
    method: 'POST',
    headers: { 'User-Agent': UA, Referer: referer, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ publicDataDetailPk: ds.detailPk, publicDataPk: ds.publicDataPk, atchFileId: '', fileDetailSn: '1', publicDataTyCode: 'PR0051' }),
  });
  const j = (await res.json()) as { status?: boolean; atchFileId?: string; fileDetailSn?: string | number };
  if (!j.status || !j.atchFileId) throw new Error(`파일 ID 조회 실패: ${ds.publicDataPk}`);
  const f = await fetch(`${BASE}/cmm/cmm/fileDownload.do?atchFileId=${j.atchFileId}&fileDetailSn=${j.fileDetailSn ?? 1}&insertDataPrcus=N`, {
    headers: { 'User-Agent': UA, Referer: referer },
  });
  if (!f.ok) throw new Error(`다운로드 실패 HTTP ${f.status}: ${ds.publicDataPk}`);
  const buf = new Uint8Array(await f.arrayBuffer());
  if (buf.length < 1000) throw new Error(`다운로드 파일이 너무 작다(${buf.length}B): ${ds.publicDataPk}`);
  return buf;
}
