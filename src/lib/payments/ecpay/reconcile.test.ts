import { describe, expect, it } from 'vitest';
import { parseFundingReconDetailCsv, splitCsvLine } from './adapter';

/** Fixture modelled on the official FundingReconDetail schema (decision-record §6). */
const FIXTURE_CSV = [
  '特店編號,撥款日期,撥款金額,訂單編號,交易序號,交易日期,交易時間,交易金額,交易手續費,交易狀態,退款金額,退款狀態,交易類別',
  '2000132,20260816,1000,BJH202608160001,TN202608160001,20260816,103000,790,0,1,0,0,1',
  '2000132,20260816,-100,BJH202608160002,"TN2026,08160002",20260816,103100,790,0,1,-790,1,3',
  '2000132,20260816,,BJH202608160003,TN202608160003,20260816,103200,390,0,1,0,0,2',
  '合計,2000132,900,,,,,,,,,,',
].join('\n');

describe('parseFundingReconDetailCsv', () => {
  it('parses data rows and skips header + summary rows', () => {
    const entries = parseFundingReconDetailCsv(FIXTURE_CSV);
    expect(entries).toHaveLength(3);
    expect(entries[0]).toEqual({
      merchantId: '2000132',
      fundingDate: '20260816',
      fundingAmount: '1000',
      merchantTradeNo: 'BJH202608160001',
      tradeNo: 'TN202608160001',
      tradeDate: '20260816',
      tradeTime: '103000',
      tradeAmt: '790',
      tradeFee: '0',
      tradeStatus: '1',
      refundAmount: '0',
      refundStatus: '0',
      tradeType: '1',
    });
  });

  it('preserves quoted commas and negative refund amounts (退款金額為負數)', () => {
    const entries = parseFundingReconDetailCsv(FIXTURE_CSV);
    expect(entries[1].tradeNo).toBe('TN2026,08160002');
    expect(entries[1].refundAmount).toBe('-790');
  });

  it('keeps empty fields intact', () => {
    const entries = parseFundingReconDetailCsv(FIXTURE_CSV);
    expect(entries[2].fundingAmount).toBe('');
  });

  it('returns an empty list for header-only / blank input', () => {
    expect(parseFundingReconDetailCsv('特店編號,撥款日期,撥款金額,訂單編號,交易序號,交易日期,交易時間,交易金額,交易手續費,交易狀態,退款金額,退款狀態,交易類別')).toHaveLength(0);
    expect(parseFundingReconDetailCsv('\n\n')).toHaveLength(0);
  });
});

describe('splitCsvLine', () => {
  it('splits on unquoted commas', () => {
    expect(splitCsvLine('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('honors double-quoted fields containing commas', () => {
    expect(splitCsvLine('a,"b,c",d')).toEqual(['a', 'b,c', 'd']);
  });

  it('unescapes doubled quotes inside quoted fields', () => {
    expect(splitCsvLine('a,"he said ""hi""",b')).toEqual(['a', 'he said "hi"', 'b']);
  });
});
