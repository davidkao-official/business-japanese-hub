import { ecpayCheckMac, verifyCheckMac, sha256Hex } from './checkmac.ts';
import type { EcpayLanguage } from './types.ts';

export const PLUS_TRADE_DESC = 'Business Japanese Hub Plus';
export const PLUS_PERIOD_EXEC_TIMES = 99;
const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;

export function formatTaipeiDateTime(date: Date): string {
  const taipei = new Date(date.getTime() + TAIPEI_OFFSET_MS);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${String(taipei.getUTCFullYear()).padStart(4, '0')}/${pad(taipei.getUTCMonth() + 1)}/${pad(taipei.getUTCDate())} ${pad(taipei.getUTCHours())}:${pad(taipei.getUTCMinutes())}:${pad(taipei.getUTCSeconds())}`;
}

export function parseTaipeiDateTime(value: string): Date {
  const match = /^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    throw new Error('invalid Taipei date-time');
  }

  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const localAsUtc = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (
    localAsUtc.getUTCFullYear() !== year ||
    localAsUtc.getUTCMonth() !== month - 1 ||
    localAsUtc.getUTCDate() !== day ||
    localAsUtc.getUTCHours() !== hour ||
    localAsUtc.getUTCMinutes() !== minute ||
    localAsUtc.getUTCSeconds() !== second
  ) {
    throw new Error('invalid Taipei date-time');
  }

  return new Date(localAsUtc.getTime() - TAIPEI_OFFSET_MS);
}

export function paidPeriodFor(processAt: Date): { start: Date; end: Date } {
  const taipei = new Date(processAt.getTime() + TAIPEI_OFFSET_MS);
  const year = taipei.getUTCFullYear();
  const month = taipei.getUTCMonth();
  const targetMonthIndex = month + 1;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const targetMonth = targetMonthIndex % 12;
  const day = Math.min(
    taipei.getUTCDate(),
    new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate(),
  );
  const end = new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      day,
      taipei.getUTCHours(),
      taipei.getUTCMinutes(),
      taipei.getUTCSeconds(),
      taipei.getUTCMilliseconds(),
    ) - TAIPEI_OFFSET_MS,
  );
  return { start: new Date(processAt), end };
}

export interface PeriodCheckoutInput {
  merchantId: string;
  merchantTradeNo: string;
  now: Date;
  periodAmountTwd: number;
  execTimes: number;
  itemName: string;
  returnUrl: string;
  periodReturnUrl: string;
  orderResultUrl?: string;
  clientBackUrl?: string;
  language: EcpayLanguage;
  hashKey: string;
  hashIV: string;
}

export async function buildPeriodCheckoutFields(
  input: PeriodCheckoutInput,
): Promise<Record<string, string>> {
  if (!Number.isSafeInteger(input.periodAmountTwd) || input.periodAmountTwd <= 0) {
    throw new Error('periodAmountTwd must be a positive safe integer');
  }
  if (!Number.isInteger(input.execTimes) || input.execTimes < 2 || input.execTimes > PLUS_PERIOD_EXEC_TIMES) {
    throw new Error('execTimes must be an integer from 2 to 99');
  }

  const fields: Record<string, string> = {
    MerchantID: input.merchantId,
    MerchantTradeNo: input.merchantTradeNo,
    MerchantTradeDate: formatTaipeiDateTime(input.now),
    PaymentType: 'aio',
    TotalAmount: String(input.periodAmountTwd),
    TradeDesc: PLUS_TRADE_DESC,
    ItemName: input.itemName,
    ReturnURL: input.returnUrl,
    ChoosePayment: 'Credit',
    EncryptType: '1',
    NeedExtraPaidInfo: 'N',
    Language: input.language,
    PeriodAmount: String(input.periodAmountTwd),
    PeriodType: 'M',
    Frequency: '1',
    ExecTimes: String(input.execTimes),
    PeriodReturnURL: input.periodReturnUrl,
  };
  if (input.orderResultUrl) fields.OrderResultURL = input.orderResultUrl;
  if (input.clientBackUrl) fields.ClientBackURL = input.clientBackUrl;
  const CheckMacValue = await ecpayCheckMac(fields, input.hashKey, input.hashIV);
  return { ...fields, CheckMacValue };
}

export interface EcpayPeriodAuthorization {
  merchantTradeNo: string;
  rtnCode: string;
  amountTwd: number;
  gwsr: string;
  tradeNo: string | null;
  processAt: Date;
  totalSuccessTimes: number;
  simulatePaid: boolean;
  sourceEventId: string;
  factsSha256: string;
}

export async function periodAuthorizationFacts(f: {
  merchantTradeNo: string;
  rtnCode: string;
  amountTwd: number;
  gwsr: string;
  processAt: Date;
}): Promise<string> {
  return sha256Hex(
    `merchantTradeNo=${f.merchantTradeNo}&rtnCode=${f.rtnCode}&amountTwd=${f.amountTwd}&gwsr=${f.gwsr}&processAt=${f.processAt.toISOString()}`,
  );
}

export async function verifyPeriodNotification(
  form: Record<string, string>,
  cfg: { merchantId: string; hashKey: string; hashIV: string },
): Promise<EcpayPeriodAuthorization> {
  if (!(await verifyCheckMac(form, cfg.hashKey, cfg.hashIV, form.CheckMacValue ?? ''))) {
    throw new Error('invalid CheckMacValue');
  }
  if (form.MerchantID !== cfg.merchantId) {
    throw new Error('unexpected MerchantID');
  }
  if (form.PeriodType !== 'M') {
    throw new Error('unexpected PeriodType');
  }

  const merchantTradeNo = form.MerchantTradeNo;
  const rtnCode = form.RtnCode;
  const gwsr = form.gwsr;
  const processDate = form.ProcessDate;
  if (!merchantTradeNo || !rtnCode || !gwsr || !processDate) {
    throw new Error('missing period notification field');
  }

  const amountTwd = Number(form.Amount);
  const totalSuccessTimes = Number(form.TotalSuccessTimes);
  if (
    !/^-?\d+$/.test(form.Amount ?? '') ||
    !/^-?\d+$/.test(form.TotalSuccessTimes ?? '') ||
    !Number.isInteger(amountTwd) ||
    !Number.isInteger(totalSuccessTimes)
  ) {
    throw new Error('invalid period notification integer');
  }
  const processAt = parseTaipeiDateTime(processDate);
  const factsSha256 = await periodAuthorizationFacts({
    merchantTradeNo,
    rtnCode,
    amountTwd,
    gwsr,
    processAt,
  });
  return {
    merchantTradeNo,
    rtnCode,
    amountTwd,
    gwsr,
    tradeNo: form.TradeNo || null,
    processAt,
    totalSuccessTimes,
    simulatePaid: form.SimulatePaid === '1',
    sourceEventId: `${merchantTradeNo}:auth:${gwsr}`,
    factsSha256,
  };
}

interface PeriodMutationInput {
  merchantId: string;
  merchantTradeNo: string;
  now: Date;
  hashKey: string;
  hashIV: string;
}

export async function buildPeriodQueryFields(
  input: PeriodMutationInput,
): Promise<Record<string, string>> {
  const fields = {
    MerchantID: input.merchantId,
    MerchantTradeNo: input.merchantTradeNo,
    TimeStamp: String(Math.floor(input.now.getTime() / 1000)),
  };
  const CheckMacValue = await ecpayCheckMac(fields, input.hashKey, input.hashIV);
  return { ...fields, CheckMacValue };
}

export async function buildPeriodCancelFields(
  input: PeriodMutationInput,
): Promise<Record<string, string>> {
  const fields = {
    MerchantID: input.merchantId,
    MerchantTradeNo: input.merchantTradeNo,
    Action: 'Cancel',
    TimeStamp: String(Math.floor(input.now.getTime() / 1000)),
  };
  const CheckMacValue = await ecpayCheckMac(fields, input.hashKey, input.hashIV);
  return { ...fields, CheckMacValue };
}
