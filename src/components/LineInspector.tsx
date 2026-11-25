import { ParsedRecord } from '../types/ccp';
import {
  computeCcpKey,
  computeRipKeyOffset85,
  findAlgerianBankByCode,
  formatDZD,
  maskAccountNumber,
} from '../engine/cryptoKeys';

interface LineInspectorProps {
  record: ParsedRecord;
  formatKind: 'rip' | 'non-rip' | 'rib';
  privacyMode: boolean;
}

interface FieldSlice {
  label: string;
  range: string;
  length: number;
  value: string;
  displayValue: string;
  helper?: string;
}

export function LineInspector({ record, formatKind, privacyMode }: LineInspectorProps) {
  const line = record.rawLine;
  const isHeader = record.kind === 'header';

  const accountMasked = record.accountFull20
    ? maskAccountNumber(record.accountFull20, privacyMode)
    : line.slice(1, 21);

  const prefix8 = line.slice(1, 9);
  const ccp10Raw = line.slice(9, 19);
  const ccp10 = privacyMode ? '••••••••••' : ccp10Raw;
  const key2 = line.slice(19, 21);
  const amount13 = line.slice(21, 34);
  const validCcp = /^\d{10}$/.test(ccp10Raw) && !/^0{10}$/.test(ccp10Raw);
  const calcRipKey = validCcp ? computeRipKeyOffset85(ccp10Raw) : null;
  const calcCcpKey = validCcp ? computeCcpKey(ccp10Raw) : null;
  const bankDetails = record.bankRibDetails;
  const bankInfo = bankDetails ? findAlgerianBankByCode(bankDetails.bankCode) : undefined;

  const isBankLine = formatKind === 'rib' && Boolean(bankDetails);

  const prefixLabel = isBankLine
    ? 'Banque & Agence'
    : prefix8 === '00799999' || formatKind === 'rip'
      ? 'Préfixe RIP'
      : 'Bourrage non-RIP';

  const prefixHelper = isBankLine && bankDetails
    ? `${bankInfo ? bankInfo.shortName : `Banque ${bankDetails.bankCode}`} · Agence ${bankDetails.branchCode}`
    : prefix8 === '00799999' || formatKind === 'rip'
      ? 'Attendu : 00799999'
      : 'Attendu : 00000000';

  const accountLabel = isBankLine ? 'Compte bancaire' : 'Compte CCP';
  const keyLabel = isBankLine ? 'Clé RIB (Mod 97)' : 'Clé (CCP / RIP)';

  const keyHelper = isBankLine && bankDetails
    ? bankDetails.validBankKey
      ? `Clé Mod 97 valide (${bankDetails.actualKey})`
      : `Invalide · Attendu : ${bankDetails.expectedKey}`
    : calcRipKey && calcCcpKey
      ? key2 === calcRipKey && key2 === calcCcpKey
        ? `Valide (RIP & CCP : ${key2})`
        : key2 === calcRipKey
          ? `Clé RIP valide (${calcRipKey}) · CCP : ${calcCcpKey}`
          : key2 === calcCcpKey
            ? `Clé CCP valide (${calcCcpKey}) · RIP : ${calcRipKey}`
            : `Invalide · RIP : ${calcRipKey} / CCP : ${calcCcpKey}`
      : undefined;

  const slices: FieldSlice[] = isHeader
    ? [
        { label: 'Début', range: 'Pos 1', length: 1, value: line.slice(0, 1), displayValue: line.slice(0, 1) || '∅' },
        {
          label: prefixLabel,
          range: 'Pos 2–9',
          length: 8,
          value: prefix8,
          displayValue: prefix8 || '∅',
          helper: prefixHelper,
        },
        {
          label: accountLabel,
          range: 'Pos 10–19',
          length: 10,
          value: line.slice(9, 19),
          displayValue: ccp10 || '∅',
        },
        {
          label: keyLabel,
          range: 'Pos 20–21',
          length: 2,
          value: key2,
          displayValue: key2 || '∅',
          helper: keyHelper,
        },
        {
          label: 'Montant global',
          range: 'Pos 22–34',
          length: 13,
          value: amount13,
          displayValue: amount13 || '∅',
          helper: /^\d{13}$/.test(amount13) ? formatDZD(Number(amount13)) : 'Format invalide',
        },
        {
          label: 'Nombre',
          range: 'Pos 35–41',
          length: 7,
          value: line.slice(34, 41),
          displayValue: line.slice(34, 41) || '∅',
          helper: /^\d{7}$/.test(line.slice(34, 41)) ? `${Number(line.slice(34, 41))} bénéficiaires` : undefined,
        },
        {
          label: 'Mois',
          range: 'Pos 42–43',
          length: 2,
          value: line.slice(41, 43),
          displayValue: line.slice(41, 43) || '∅',
        },
        {
          label: 'Année',
          range: 'Pos 44–47',
          length: 4,
          value: line.slice(43, 47),
          displayValue: line.slice(43, 47) || '∅',
        },
        {
          label: '14 espaces',
          range: 'Pos 48–61',
          length: 14,
          value: line.slice(47, 61),
          displayValue: line.slice(47, 61).replace(/ /g, '·') || '∅',
          helper: `${line.slice(47, 61).length} car.`,
        },
        {
          label: 'Type',
          range: 'Pos 62',
          length: 1,
          value: line.slice(61, 62),
          displayValue: line.slice(61, 62) || '∅',
          helper: '0 = En-tête',
        },
      ]
    : [
        { label: 'Début', range: 'Pos 1', length: 1, value: line.slice(0, 1), displayValue: line.slice(0, 1) || '∅' },
        {
          label: prefixLabel,
          range: 'Pos 2–9',
          length: 8,
          value: prefix8,
          displayValue: prefix8 || '∅',
          helper: prefixHelper,
        },
        {
          label: accountLabel,
          range: 'Pos 10–19',
          length: 10,
          value: line.slice(9, 19),
          displayValue: ccp10 || '∅',
        },
        {
          label: keyLabel,
          range: 'Pos 20–21',
          length: 2,
          value: key2,
          displayValue: key2 || '∅',
          helper: keyHelper,
        },
        {
          label: 'Montant',
          range: 'Pos 22–34',
          length: 13,
          value: amount13,
          displayValue: amount13 || '∅',
          helper: /^\d{13}$/.test(amount13) ? formatDZD(Number(amount13)) : 'Format invalide',
        },
        {
          label: 'Nom et Prénom (27 car.)',
          range: 'Pos 35–61',
          length: 27,
          value: line.slice(34, 61),
          displayValue: line.slice(34, 61).replace(/ /g, '·') || '∅',
          helper: `${line.slice(34, 61).length} car.`,
        },
        {
          label: 'Type',
          range: 'Pos 62',
          length: 1,
          value: line.slice(61, 62),
          displayValue: line.slice(61, 62) || '∅',
          helper: '1 = Bénéficiaire',
        },
      ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
        <div>
          <span className="font-semibold text-slate-900">
            Ligne {record.lineNumber} ({isHeader ? 'En-tête global' : 'Bénéficiaire'})
          </span>
          <span className="mx-2" aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">
            Longueur mesurée :{' '}
            <strong className={record.lineLength === 62 ? 'text-emerald-700' : 'text-red-700'}>
              {record.lineLength} / 62 car.
            </strong>
          </span>
          <span className="mx-2" aria-hidden="true">·</span>
          <span className="font-mono">{accountMasked}</span>
        </div>
        <span className="text-[11px] text-slate-500">
          Les points « · » matérialisent les espaces exacts de bourrage
        </span>
      </div>

      {record.bankRibDetails && (
        <div className="rounded border border-indigo-200 bg-indigo-50/50 p-3 text-xs space-y-1">
          <p className="font-semibold text-indigo-900">Analyse RIB Bancaire &amp; Conversion CCP :</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px] text-slate-800">
            <div>Code Banque : <strong>{record.bankRibDetails.bankCode}</strong></div>
            <div>Guichet : <strong>{record.bankRibDetails.branchCode}</strong></div>
            <div>Clé Mod 97 : <strong className={record.bankRibDetails.validBankKey ? 'text-emerald-700' : 'text-red-700'}>{record.bankRibDetails.actualKey} {record.bankRibDetails.validBankKey ? '(Valide)' : `(Attendu: ${record.bankRibDetails.expectedKey})`}</strong></div>
            <div>Équivalent CCP interne : <strong>{maskAccountNumber(record.bankRibDetails.ccpEquivalent ?? '', privacyMode)}</strong></div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {slices.map((s) => (
          <div key={s.range} className="rounded border border-slate-200 bg-slate-50/70 px-3 py-2">
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span className="font-medium text-slate-700 truncate">{s.label}</span>
              <span className="font-mono shrink-0">{s.range}</span>
            </div>
            <p className="mt-1 font-mono text-xs font-semibold text-slate-900 break-all">
              {s.displayValue}
            </p>
            {s.helper && <p className="mt-0.5 text-[11px] text-slate-500">{s.helper}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
