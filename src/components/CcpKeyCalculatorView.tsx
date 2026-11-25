import { useMemo, useState } from 'react';
import { Building2, Calculator, Check, CheckCircle2, Copy, Download, RotateCcw, XCircle } from 'lucide-react';
import {
  AccountKeyFormat,
  CCP_KEY_WEIGHTS,
  KeyValidationPolicy,
  NON_RIP_PREFIX,
  RIP_PREFIX,
  buildBatchKeysCsv,
  evaluateAccountCompliance,
  evaluateBatchAccounts,
} from '../engine/ccpKeyCalculator';
import { ALGERIAN_BANKS, findAlgerianBankByCode, maskAccountNumber } from '../engine/cryptoKeys';

interface CcpKeyCalculatorViewProps {
  privacyMode: boolean;
}

type CalcMode = 'single' | 'batch';

const QUICK_EXAMPLES: Array<{
  label: string;
  account: string;
  key: string;
  format: AccountKeyFormat;
  bankCode?: string;
  agencyCode?: string;
}> = [
  {
    label: 'RIP 5040 (Clé 55)',
    account: '00799999000000504055',
    key: '',
    format: 'rip',
  },
  {
    label: 'non-RIP 300076 (Clé 86)',
    account: '00000000000030007686',
    key: '',
    format: 'non-rip',
  },
  {
    label: 'BNA 001 (Clé 44)',
    account: '00100101001234567844',
    key: '',
    format: 'bank-rib',
    bankCode: '001',
    agencyCode: '00101',
  },
  {
    label: 'BEA 002 (Clé 92)',
    account: '00200050000045678992',
    key: '',
    format: 'bank-rib',
    bankCode: '002',
    agencyCode: '00050',
  },
  {
    label: 'Trésor 008 (Clé 38)',
    account: '00800016000012345638',
    key: '',
    format: 'bank-rib',
    bankCode: '008',
    agencyCode: '00016',
  },
  {
    label: 'Erreur RIB invalide',
    account: '00100101001234567899',
    key: '',
    format: 'bank-rib',
    bankCode: '001',
    agencyCode: '00101',
  },
];

const MIXED_BATCH_SAMPLE = [
  '00799999000000504055',
  '00000000000450947968',
  '00100101001234567844',
  '00200050000045678992',
  '00800016000012345638',
  '011;00210;9876543;34',
  '00100101001234567899',
].join('\n');

export function CcpKeyCalculatorView({ privacyMode }: CcpKeyCalculatorViewProps) {
  const [mode, setMode] = useState<CalcMode>('single');
  const [accountFormat, setAccountFormat] = useState<AccountKeyFormat>('rip');
  const [policy, setPolicy] = useState<KeyValidationPolicy>('algerie-poste');
  const [selectedBankChoice, setSelectedBankChoice] = useState<string>('001');
  const [customBankCode, setCustomBankCode] = useState<string>('001');
  const [bankAgencyCode, setBankAgencyCode] = useState<string>('00101');
  const [accountInput, setAccountInput] = useState('00799999000000504055');
  const [keyToVerify, setKeyToVerify] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [batchInput, setBatchInput] = useState(
    '00799999000000504055\n00799999000030007686\n00100101001234567844\n00200050000045678992\n00799999000000504099'
  );

  const activeBankCode = selectedBankChoice === 'custom' ? customBankCode : selectedBankChoice;

  // Évaluation unitaire déléguée au moteur engine/ccpKeyCalculator.ts
  const singleEval = useMemo(
    () =>
      evaluateAccountCompliance(accountInput, accountFormat, keyToVerify, policy, {
        bankCode: activeBankCode,
        agencyCode: bankAgencyCode,
      }),
    [accountInput, accountFormat, keyToVerify, policy, activeBankCode, bankAgencyCode]
  );

  const { parsed, effectiveFormat, calculation: calc, compliance } = singleEval;

  // Évaluation par lot déléguée au moteur engine/ccpKeyCalculator.ts
  const batchEval = useMemo(
    () =>
      evaluateBatchAccounts(batchInput, accountFormat, policy, {
        bankCode: activeBankCode,
        agencyCode: bankAgencyCode,
      }),
    [batchInput, accountFormat, policy, activeBankCode, bankAgencyCode]
  );

  const syncBankSelectionFromCode = (bankCode: string, agencyCode?: string) => {
    const known = findAlgerianBankByCode(bankCode);
    if (known) {
      setSelectedBankChoice(known.code);
    } else {
      setSelectedBankChoice('custom');
      setCustomBankCode(bankCode);
    }
    if (agencyCode) {
      setBankAgencyCode(agencyCode);
    }
  };

  const handleBankDropdownChange = (choice: string) => {
    setSelectedBankChoice(choice);
    if (choice !== 'custom') {
      const bankInfo = findAlgerianBankByCode(choice);
      const nextAgency = bankInfo?.defaultAgency ?? (bankAgencyCode === '99999' ? '00101' : bankAgencyCode || '00101');
      setBankAgencyCode(nextAgency);

      // Si l'utilisateur avait un bloc RIB bancaire complet de 20 ch. saisi, mettre à jour son code banque
      const trimmed = accountInput.trim();
      const digits = trimmed.replace(/\D/g, '');
      if (digits.length === 20 && !digits.startsWith(RIP_PREFIX) && !digits.startsWith(NON_RIP_PREFIX)) {
        const accountPart = digits.slice(8, 18);
        setAccountInput(accountPart);
      }
    }
  };

  const handleAccountInputChange = (value: string) => {
    setAccountInput(value);
    const trimmed = value.trim();
    const digits = trimmed.replace(/\D/g, '');

    if (trimmed.startsWith(`*${RIP_PREFIX}`) || (digits.length === 20 && digits.startsWith(RIP_PREFIX))) {
      setAccountFormat('rip');
      return;
    }
    if (trimmed.startsWith(`*${NON_RIP_PREFIX}`) || (digits.length === 20 && digits.startsWith(NON_RIP_PREFIX))) {
      setAccountFormat('non-rip');
      return;
    }

    // Détection automatique d'un RIB bancaire (20 chiffres ou ligne * commençant par un code banque != 000)
    const candidate20 =
      trimmed.startsWith('*') && trimmed.length >= 21 && /^\d{20}$/.test(trimmed.slice(1, 21))
        ? trimmed.slice(1, 21)
        : digits.length === 20
          ? digits
          : null;

    if (candidate20 && candidate20.slice(0, 3) !== '000') {
      setAccountFormat('bank-rib');
      syncBankSelectionFromCode(candidate20.slice(0, 3), candidate20.slice(3, 8));
    }
  };

  const handleSelectFormat = (nextFormat: AccountKeyFormat) => {
    setAccountFormat(nextFormat);
    const trimmed = accountInput.trim();
    const digits = trimmed.replace(/\D/g, '');

    if (nextFormat === 'bank-rib') {
      if (digits.length === 20 && (digits.startsWith(RIP_PREFIX) || digits.startsWith(NON_RIP_PREFIX))) {
        setAccountInput(digits.slice(8, 18));
      }
      return;
    }

    const nextPrefix = nextFormat === 'rip' ? RIP_PREFIX : NON_RIP_PREFIX;
    if (trimmed.startsWith('*') && trimmed.length >= 21 && /^\d{20}$/.test(trimmed.slice(1, 21))) {
      setAccountInput(`*${nextPrefix}${trimmed.slice(9)}`);
      return;
    }
    if (digits.length === 20) {
      setAccountInput(`${nextPrefix}${digits.slice(8)}`);
    }
  };

  const handleCopy = async (id: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(id);
      setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1500);
    } catch {
      // fallback silencieux si presse-papiers indisponible
    }
  };

  const handleExportBatchCsv = () => {
    const csv = buildBatchKeysCsv(batchEval.rows, privacyMode);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `calcul_cles_ccp_rib_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const sourceLabel = useMemo(() => {
    switch (parsed.sourceKind) {
      case 'rip-20':
        return `Bloc RIP de 20 chiffres détecté (${RIP_PREFIX})`;
      case 'nonrip-20':
        return `Bloc non-RIP de 20 chiffres détecté (${NON_RIP_PREFIX})`;
      case 'bank-rib-20': {
        const bank = parsed.bankCode ? findAlgerianBankByCode(parsed.bankCode) : undefined;
        return `RIB bancaire de 20 chiffres détecté (${bank ? `${bank.shortName} · ${bank.code}` : `Code ${parsed.bankCode}`}, agence ${parsed.agencyCode})`;
      }
      case 'line-62-rip':
        return `Ligne de fichier Algérie Poste RIP détectée (${RIP_PREFIX})`;
      case 'line-62-nonrip':
        return `Ligne de fichier Algérie Poste non-RIP détectée (${NON_RIP_PREFIX})`;
      case 'line-62-bank-rib': {
        const bank = parsed.bankCode ? findAlgerianBankByCode(parsed.bankCode) : undefined;
        return `Ligne de fichier RIB bancaire détectée (${bank ? `${bank.shortName} · ${bank.code}` : `Code ${parsed.bankCode}`}, agence ${parsed.agencyCode})`;
      }
      case 'ccp-with-key':
        return 'Numéro de compte et clé extraits automatiquement de la saisie';
      default:
        return null;
    }
  }, [parsed.sourceKind, parsed.bankCode, parsed.agencyCode]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Calculateur et vérificateur de Clé CCP, RIP & RIB bancaire
          </h1>
          <p className="mt-1 text-sm text-slate-600 max-w-2xl">
            Calcule la <strong>Clé CCP</strong> (poids 4 à 13 mod 100), la <strong>Clé RIP</strong> Algérie Poste (Mod 97 + 85)
            et la <strong>Clé RIB bancaire algérienne</strong> (Mod 97 sur 18 chiffres) selon l&apos;établissement sélectionné.
          </p>
        </div>

        {/* Mode Segmented Control */}
        <div className="inline-flex items-center gap-1 rounded-md bg-slate-200/70 p-1 shrink-0 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setMode('single')}
            className={`rounded px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              mode === 'single'
                ? 'bg-white text-[#0F2942] shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Vérification unitaire
          </button>
          <button
            type="button"
            onClick={() => setMode('batch')}
            className={`rounded px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              mode === 'batch'
                ? 'bg-white text-[#0F2942] shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Contrôle par lot ({batchEval.rows.length})
          </button>
        </div>
      </div>

      {/* MODE 1 : CALCUL & VÉRIFICATION UNITAIRE */}
      {mode === 'single' && (
        <div className="space-y-6">
          {/* Input Panel */}
          <div className="rounded-md border border-slate-200 bg-white p-5 space-y-4">
            {/* Format + Policy selector bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
              <div className="inline-flex flex-wrap items-center gap-1 rounded-md bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => handleSelectFormat('non-rip')}
                  className={`rounded px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                    effectiveFormat === 'non-rip'
                      ? 'bg-[#0F2942] text-white'
                      : 'text-slate-700 hover:text-slate-900'
                  }`}
                >
                  Format non-RIP ({NON_RIP_PREFIX})
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectFormat('rip')}
                  className={`rounded px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                    effectiveFormat === 'rip'
                      ? 'bg-[#0F2942] text-white'
                      : 'text-slate-700 hover:text-slate-900'
                  }`}
                >
                  Format RIP ({RIP_PREFIX})
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectFormat('bank-rib')}
                  className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                    effectiveFormat === 'bank-rib'
                      ? 'bg-[#0F2942] text-white'
                      : 'text-slate-700 hover:text-slate-900'
                  }`}
                >
                  <Building2 className="h-3.5 w-3.5" />
                  <span>RIB Bancaire / Trésor (001–038)</span>
                </button>
              </div>

              {effectiveFormat !== 'bank-rib' || activeBankCode === '007' ? (
                <div className="inline-flex items-center gap-1 rounded-md bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => setPolicy('algerie-poste')}
                    className={`rounded px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                      policy === 'algerie-poste'
                        ? 'bg-white text-[#0F2942] shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Algérie Poste (Clé CCP ou RIP)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPolicy('strict')}
                    className={`rounded px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                      policy === 'strict'
                        ? 'bg-white text-[#0F2942] shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Strict par format
                  </button>
                </div>
              ) : (
                <span className="text-xs font-medium text-slate-500">
                  Norme Banque d&apos;Algérie · Modulo 97 (clé 01–97)
                </span>
              )}
            </div>

            {/* Sélecteur de banque et code agence lorsque le mode RIB Bancaire est actif */}
            {effectiveFormat === 'bank-rib' && (
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 rounded-md border border-slate-200 bg-slate-50/70 p-3.5">
                <div className={selectedBankChoice === 'custom' ? 'sm:col-span-6 space-y-1.5' : 'sm:col-span-8 space-y-1.5'}>
                  <label htmlFor="bank-selector" className="block text-xs font-semibold text-slate-700">
                    Banque ou institution algérienne (Code 3 chiffres)
                  </label>
                  <select
                    id="bank-selector"
                    value={selectedBankChoice}
                    onChange={(e) => handleBankDropdownChange(e.target.value)}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-[#0F2942] focus:outline-none"
                  >
                    {ALGERIAN_BANKS.map((bank) => (
                      <option key={bank.code} value={bank.code}>
                        {bank.code} — {bank.shortName} ({bank.name})
                      </option>
                    ))}
                    <option value="custom">Autre code banque personnalisé (3 chiffres)...</option>
                  </select>
                </div>

                {selectedBankChoice === 'custom' && (
                  <div className="sm:col-span-2 space-y-1.5">
                    <label htmlFor="custom-bank-code" className="block text-xs font-semibold text-slate-700">
                      Code banque
                    </label>
                    <input
                      id="custom-bank-code"
                      type="text"
                      inputMode="numeric"
                      maxLength={3}
                      value={customBankCode}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '').slice(0, 3);
                        setCustomBankCode(val);
                      }}
                      placeholder="Ex. 019"
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-xs font-semibold text-slate-900 tabular-nums"
                    />
                  </div>
                )}

                <div className="sm:col-span-4 space-y-1.5">
                  <label htmlFor="bank-agency-code" className="block text-xs font-semibold text-slate-700">
                    Code agence / guichet (5 chiffres)
                  </label>
                  <input
                    id="bank-agency-code"
                    type="text"
                    inputMode="numeric"
                    maxLength={5}
                    value={bankAgencyCode}
                    onChange={(e) => setBankAgencyCode(e.target.value.replace(/\D/g, '').slice(0, 5))}
                    placeholder="Ex. 00101"
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-xs font-semibold text-slate-900 tabular-nums"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className="md:col-span-7 space-y-1.5">
                <label htmlFor="ccp-number-input" className="block text-xs font-semibold text-slate-700">
                  {effectiveFormat === 'bank-rib'
                    ? 'Numéro de compte (1 à 10 ch.), paire compte/clé ou RIB complet (20 chiffres)'
                    : 'Numéro de compte CCP, paire compte/clé, bloc 20 chiffres ou ligne fichier (*)'}
                </label>
                <input
                  id="ccp-number-input"
                  type="text"
                  value={accountInput}
                  onChange={(e) => handleAccountInputChange(e.target.value)}
                  placeholder={
                    effectiveFormat === 'bank-rib'
                      ? 'Ex. 12345678, 12345678/44 ou 00100101001234567844'
                      : 'Ex. 5040, 5040/55, 00799999000000504055 ou 00000000000030007686'
                  }
                  className="w-full rounded-md border border-slate-300 bg-white px-3.5 py-2.5 font-mono text-base font-medium text-slate-900 placeholder:text-slate-400 tabular-nums"
                />
                {sourceLabel && (
                  <p className="text-xs text-slate-500">
                    {sourceLabel}
                    {parsed.extractedKey && (
                      <>
                        {' '}· Clé détectée :{' '}
                        <span className="font-mono font-semibold text-slate-900">{parsed.extractedKey}</span>
                      </>
                    )}
                  </p>
                )}
              </div>

              <div className="md:col-span-3 space-y-1.5">
                <label htmlFor="ccp-key-verify" className="block text-xs font-semibold text-slate-700">
                  Clé à vérifier (optionnel)
                </label>
                <input
                  id="ccp-key-verify"
                  type="text"
                  inputMode="numeric"
                  maxLength={2}
                  value={keyToVerify}
                  onChange={(e) => setKeyToVerify(e.target.value.replace(/\D/g, '').slice(0, 2))}
                  placeholder={parsed.extractedKey ? `Auto (${parsed.extractedKey})` : 'Ex. 44'}
                  className="w-full rounded-md border border-slate-300 bg-white px-3.5 py-2.5 font-mono text-base font-medium text-slate-900 placeholder:text-slate-400 tabular-nums"
                />
              </div>

              <div className="md:col-span-2 flex items-end">
                <button
                  type="button"
                  onClick={() => {
                    setAccountInput('');
                    setKeyToVerify('');
                  }}
                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Effacer</span>
                </button>
              </div>
            </div>

            {/* Quick Verified Examples */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-xs text-slate-500">Exemples :</span>
              {QUICK_EXAMPLES.map((ex) => (
                <button
                  key={`${ex.format}-${ex.account}`}
                  type="button"
                  onClick={() => {
                    setAccountFormat(ex.format);
                    if (ex.bankCode) {
                      syncBankSelectionFromCode(ex.bankCode, ex.agencyCode);
                    }
                    setAccountInput(ex.account);
                    setKeyToVerify(ex.key);
                  }}
                  className="rounded border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors whitespace-nowrap"
                >
                  {ex.label}
                </button>
              ))}
            </div>

            {parsed.error && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800 flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-700 shrink-0" />
                <span>{parsed.error}</span>
              </div>
            )}

            {compliance && (
              <div
                className={`rounded-md border px-4 py-3 text-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${
                  compliance.status === 'conforme'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                    : compliance.status === 'incomplete-key'
                      ? 'border-amber-200 bg-amber-50 text-amber-900'
                      : 'border-red-200 bg-red-50 text-red-900'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  {compliance.status === 'conforme' ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-700 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <p className="font-semibold">{compliance.title}</p>
                    <p className="mt-0.5 opacity-95">{compliance.message}</p>
                  </div>
                </div>

                {compliance.correctedBlock20 && (
                  <button
                    type="button"
                    onClick={() => void handleCopy('corrected20', compliance.correctedBlock20!)}
                    className="inline-flex items-center gap-1.5 rounded border border-red-300 bg-white px-2.5 py-1.5 text-xs font-medium text-red-900 hover:bg-red-100/50 transition-colors shrink-0 self-start sm:self-center whitespace-nowrap"
                  >
                    {copiedId === 'corrected20' ? (
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    <span className="font-mono tabular-nums">
                      {copiedId === 'corrected20' ? 'Bloc copié' : 'Copier un bloc valide'}
                    </span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Results Strip & Breakdown */}
          {calc ? (
            calc.format === 'bank-rib' && calc.bankRib ? (
              <>
                {/* 4-cell Bank RIB Results Strip */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border border-slate-200 bg-white divide-y sm:divide-y-0 sm:divide-x divide-slate-200 rounded-md overflow-hidden">
                  <div className="p-5 flex flex-col justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium text-slate-500">
                        Clé RIB (Mod 97 · {calc.bankRib.bankShortName})
                      </p>
                      <p className="mt-2 font-mono text-3xl font-bold text-[#0F2942] tabular-nums">
                        {calc.bankRib.keyMod97}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Code banque <span className="font-mono font-semibold text-slate-700">{calc.bankRib.bankCode}</span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleCopy('bankRibKey', calc.bankRib!.keyMod97)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-[#0F2942] hover:underline self-start"
                    >
                      {copiedId === 'bankRibKey' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                      <span>{copiedId === 'bankRibKey' ? 'Copié' : 'Copier la clé RIB'}</span>
                    </button>
                  </div>

                  <div className="p-5 flex flex-col justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium text-slate-500">RIB complet (20 chiffres)</p>
                      <p className="mt-2 font-mono text-base font-semibold text-slate-900 break-all tabular-nums">
                        {maskAccountNumber(calc.bankRib.fullRib20, privacyMode)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
                        {calc.bankRib.bankCode} · {calc.bankRib.agencyCode} ·{' '}
                        {privacyMode ? maskAccountNumber(calc.bankRib.account10, true) : calc.bankRib.account10} ·{' '}
                        {calc.bankRib.keyMod97}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleCopy('fullBankRib', calc.bankRib!.fullRib20)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-[#0F2942] hover:underline self-start"
                    >
                      {copiedId === 'fullBankRib' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                      <span>{copiedId === 'fullBankRib' ? 'Copié' : 'Copier le RIB (20 ch.)'}</span>
                    </button>
                  </div>

                  <div className="p-5 flex flex-col justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium text-slate-500">Établissement &amp; Agence</p>
                      <p className="mt-2 text-sm font-semibold text-slate-900 leading-snug">
                        {calc.bankRib.bankName}
                      </p>
                      <p className="mt-1.5 text-xs text-slate-600 font-mono tabular-nums">
                        Agence : <strong>{calc.bankRib.agencyCode}</strong> · Compte :{' '}
                        <strong>{privacyMode ? maskAccountNumber(calc.bankRib.account10, true) : calc.bankRib.account10}</strong>
                      </p>
                    </div>
                    <span className="text-[11px] font-medium text-slate-500">
                      Base 18 chiffres pour Modulo 97
                    </span>
                  </div>

                  <div className="p-5 flex flex-col justify-between gap-3">
                    {calc.bankRib.isAlgeriaPoste ? (
                      <>
                        <div>
                          <p className="text-xs font-medium text-slate-500">Équivalent Algérie Poste (007)</p>
                          <p className="mt-2 font-mono text-lg font-bold text-emerald-700 tabular-nums">
                            RIP {calc.ripKey} · CCP {calc.ccpKey}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            RIP BaridiMob (+85) et Clé CCP (poids 4..13)
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleCopy('ripPoste', calc.fullRip20)}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#0F2942] hover:underline self-start"
                        >
                          {copiedId === 'ripPoste' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                          <span>{copiedId === 'ripPoste' ? 'Copié' : 'Copier RIP 00799999'}</span>
                        </button>
                      </>
                    ) : (
                      <>
                        <div>
                          <p className="text-xs font-medium text-slate-500">Preuve mathématique</p>
                          <p className="mt-2 font-mono text-2xl font-bold text-emerald-700 tabular-nums">
                            RIB mod 97 = 0
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Conforme norme interbancaire algérienne
                          </p>
                        </div>
                        <span className="text-[11px] font-medium text-emerald-700">
                          Clé comprise entre 01 et 97
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Bank RIB Step-by-step mathematical breakdown */}
                <div className="rounded-md border border-slate-200 bg-white p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold text-slate-900">
                      Détail du calcul de la Clé RIB Bancaire (Banque d&apos;Algérie — Modulo 97)
                    </h2>
                    <span className="font-mono text-xs text-slate-600 tabular-nums">
                      97 − ((Base18 × 100) mod 97) = <strong className="text-[#0F2942]">{calc.bankRib.keyMod97}</strong>
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 font-mono text-xs tabular-nums">
                    <div className="rounded border border-slate-200 bg-slate-50 px-3.5 py-2.5">
                      <span className="block font-sans text-[11px] text-slate-500">
                        1. Base 18 chiffres (Banque + Agence + Compte)
                      </span>
                      <span className="mt-1 block font-semibold text-slate-900 break-all">
                        {privacyMode
                          ? `${calc.bankRib.bankCode}${calc.bankRib.agencyCode}••••••••••`
                          : `${calc.bankRib.bankCode} ${calc.bankRib.agencyCode} ${calc.bankRib.account10}`}
                      </span>
                    </div>

                    <div className="rounded border border-slate-200 bg-slate-50 px-3.5 py-2.5">
                      <span className="block font-sans text-[11px] text-slate-500">
                        2. Reste R = (Base18 × 100) mod 97
                      </span>
                      <span className="mt-1 block font-semibold text-slate-900">
                        R = {calc.bankRib.stepRemMod97}
                      </span>
                    </div>

                    <div className="rounded border border-emerald-200 bg-emerald-50/70 px-3.5 py-2.5">
                      <span className="block font-sans text-[11px] text-emerald-800">
                        3. Clé RIB = 97 − R
                      </span>
                      <span className="mt-1 block font-bold text-emerald-800">
                        97 − {calc.bankRib.stepRemMod97} = {calc.bankRib.keyMod97}
                      </span>
                    </div>

                    <div className="rounded border border-slate-200 bg-slate-50 px-3.5 py-2.5">
                      <span className="block font-sans text-[11px] text-slate-500">
                        4. Contrôle RIB20 mod 97
                      </span>
                      <span className="mt-1 block font-semibold text-emerald-700">
                        ({calc.bankRib.stepRemMod97} + {Number(calc.bankRib.keyMod97)}) mod 97 = 0
                      </span>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border border-slate-200 bg-white divide-y sm:divide-y-0 sm:divide-x divide-slate-200 rounded-md overflow-hidden">
                  <div className="p-5 flex flex-col justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium text-slate-500">Clé CCP (poids 4 à 13)</p>
                      <p className="mt-2 font-mono text-3xl font-bold text-[#0F2942] tabular-nums">
                        {calc.ccpKey}
                      </p>
                      <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
                        {privacyMode ? maskAccountNumber(calc.ccp10, true) : calc.ccpRaw} / {calc.ccpKey}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleCopy('ccpKey', calc.ccpKey)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-[#0F2942] hover:underline self-start"
                    >
                      {copiedId === 'ccpKey' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                      <span>{copiedId === 'ccpKey' ? 'Copié' : 'Copier la clé CCP'}</span>
                    </button>
                  </div>

                  <div className="p-5 flex flex-col justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium text-slate-500">Clé RIP (Mod 97 + 85)</p>
                      <p className="mt-2 font-mono text-3xl font-bold text-emerald-700 tabular-nums">
                        {calc.ripKey}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Algorithme BaridiMob / RIP
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleCopy('ripKey', calc.ripKey)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-[#0F2942] hover:underline self-start"
                    >
                      {copiedId === 'ripKey' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                      <span>{copiedId === 'ripKey' ? 'Copié' : 'Copier la clé RIP'}</span>
                    </button>
                  </div>

                  <div className="p-5 flex flex-col justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium text-slate-500">Bloc RIP (20 chiffres)</p>
                      <p className="mt-2 font-mono text-base font-semibold text-slate-900 break-all tabular-nums">
                        {maskAccountNumber(calc.fullRip20, privacyMode)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
                        Avec Clé CCP : {maskAccountNumber(`${RIP_PREFIX}${calc.ccp10}${calc.ccpKey}`, privacyMode)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleCopy('fullRip', calc.fullRip20)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-[#0F2942] hover:underline self-start"
                    >
                      {copiedId === 'fullRip' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                      <span>{copiedId === 'fullRip' ? 'Copié' : 'Copier le RIP (20 ch.)'}</span>
                    </button>
                  </div>

                  <div className="p-5 flex flex-col justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium text-slate-500">Bloc non-RIP (20 chiffres)</p>
                      <p className="mt-2 font-mono text-base font-semibold text-slate-900 break-all tabular-nums">
                        {maskAccountNumber(calc.fullNonRip20, privacyMode)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {NON_RIP_PREFIX} + CCP (10 ch.) + Clé CCP ({calc.ccpKey})
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleCopy('fullNonRip', calc.fullNonRip20)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-[#0F2942] hover:underline self-start"
                    >
                      {copiedId === 'fullNonRip' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                      <span>{copiedId === 'fullNonRip' ? 'Copié' : 'Copier le bloc non-RIP'}</span>
                    </button>
                  </div>
                </div>

                {/* Transparent Mathematical Breakdown */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* Step-by-step CCP key table */}
                  <div className="lg:col-span-8 rounded-md border border-slate-200 bg-white p-5 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="text-sm font-semibold text-slate-900">
                        Détail du calcul de la Clé CCP (poids 4 à 13)
                      </h2>
                      <span className="font-mono text-xs text-slate-600 tabular-nums">
                        Somme = {calc.ccpBreakdown.weightedSum} · {calc.ccpBreakdown.weightedSum} mod 100 ={' '}
                        <strong className="text-[#0F2942]">{calc.ccpKey}</strong>
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="min-w-full border border-slate-200 text-center font-mono text-xs tabular-nums">
                        <thead>
                          <tr className="bg-slate-50 text-slate-500">
                            <th className="border-r border-slate-200 px-2 py-2 text-left font-sans font-medium">
                              Position
                            </th>
                            {CCP_KEY_WEIGHTS.map((_, i) => (
                              <th key={i} className="border-r border-slate-200 px-2 py-2 last:border-r-0">
                                {i + 1}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          <tr>
                            <td className="border-r border-slate-200 bg-slate-50 px-2 py-2 text-left font-sans font-medium text-slate-600">
                              Chiffre CCP
                            </td>
                            {calc.ccpBreakdown.digits.map((d, i) => (
                              <td key={i} className="border-r border-slate-200 px-2 py-2 font-semibold text-slate-900 last:border-r-0">
                                {privacyMode ? '•' : d}
                              </td>
                            ))}
                          </tr>
                          <tr>
                            <td className="border-r border-slate-200 bg-slate-50 px-2 py-2 text-left font-sans font-medium text-slate-600">
                              Coefficient
                            </td>
                            {CCP_KEY_WEIGHTS.map((w, i) => (
                              <td key={i} className="border-r border-slate-200 px-2 py-2 text-slate-600 last:border-r-0">
                                ×{w}
                              </td>
                            ))}
                          </tr>
                          <tr className="bg-slate-50/50">
                            <td className="border-r border-slate-200 bg-slate-50 px-2 py-2 text-left font-sans font-medium text-slate-600">
                              Produit
                            </td>
                            {calc.ccpBreakdown.products.map((p, i) => (
                              <td key={i} className="border-r border-slate-200 px-2 py-2 font-medium text-[#0F2942] last:border-r-0">
                                {privacyMode ? '•' : p}
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Step-by-step RIP key box */}
                  <div className="lg:col-span-4 rounded-md border border-slate-200 bg-white p-5 space-y-3">
                    <h2 className="text-sm font-semibold text-slate-900">
                      Détail du calcul de la Clé RIP (Mod 97 + 85)
                    </h2>
                    <ol className="space-y-2.5 text-xs text-slate-700 font-mono tabular-nums">
                      <li className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                        <span className="block font-sans text-[11px] text-slate-500">1. Compte CCP sur 10 chiffres</span>
                        <span className="font-semibold text-slate-900">
                          {privacyMode ? maskAccountNumber(calc.ccp10, true) : calc.ccp10}
                        </span>
                      </li>
                      <li className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                        <span className="block font-sans text-[11px] text-slate-500">2. Reste x = (CCP × 100) mod 97</span>
                        <span className="font-semibold text-slate-900">x = {calc.ripBreakdown.stepX}</span>
                      </li>
                      <li className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                        <span className="block font-sans text-[11px] text-slate-500">3. Décalage Algérie Poste r = (x + 85) mod 97</span>
                        <span className="font-semibold text-slate-900">r = {calc.ripBreakdown.stepR}</span>
                      </li>
                      <li className="rounded border border-emerald-200 bg-emerald-50/60 px-3 py-2">
                        <span className="block font-sans text-[11px] text-emerald-800">4. Clé RIP = 97 - r</span>
                        <span className="font-bold text-emerald-800">
                          Clé RIP = {calc.ripKey}
                        </span>
                      </li>
                    </ol>
                  </div>
                </div>
              </>
            )
          ) : (
            <div className="rounded-md border border-slate-200 bg-white px-6 py-12 text-center">
              <Calculator className="mx-auto h-8 w-8 text-slate-400" />
              <p className="mt-3 text-sm font-medium text-slate-800">
                Saisissez un numéro de compte, un RIB/RIP de 20 chiffres ou une ligne de fichier (*) pour calculer et vérifier sa clé.
              </p>
            </div>
          )}
        </div>
      )}

      {/* MODE 2 : CONTRÔLE PAR LOT */}
      {mode === 'batch' && (
        <div className="space-y-4">
          {batchEval.summary.total > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 border border-slate-200 bg-white divide-y sm:divide-y-0 sm:divide-x divide-slate-200 rounded-md overflow-hidden">
              <div className="p-4">
                <p className="text-xs text-slate-500">Comptes analysés</p>
                <p className="mt-1 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
                  {batchEval.summary.total}
                </p>
              </div>
              <div className="p-4">
                <p className="text-xs text-slate-500">Clés conformes</p>
                <p className="mt-1 font-mono text-2xl font-semibold text-emerald-700 tabular-nums">
                  {batchEval.summary.compliantCount}
                </p>
              </div>
              <div className="p-4">
                <p className="text-xs text-slate-500">Non conformes</p>
                <p
                  className={`mt-1 font-mono text-2xl font-semibold tabular-nums ${
                    batchEval.summary.nonCompliantCount > 0 ? 'text-red-700' : 'text-slate-900'
                  }`}
                >
                  {batchEval.summary.nonCompliantCount}
                </p>
              </div>
              <div className="p-4">
                <p className="text-xs text-slate-500">Format par défaut</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {accountFormat === 'bank-rib'
                    ? `RIB ${findAlgerianBankByCode(activeBankCode)?.shortName ?? activeBankCode}`
                    : accountFormat === 'rip'
                      ? `RIP (${RIP_PREFIX})`
                      : `non-RIP (${NON_RIP_PREFIX})`}
                </p>
              </div>
            </div>
          )}

          <div className="rounded-md border border-slate-200 bg-white p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <label htmlFor="batch-ccp-textarea" className="block text-xs font-semibold text-slate-800">
                  Liste de comptes (bloc 20 chiffres, ligne « * », « compte;clé » ou « banque;agence;compte;clé »)
                </label>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Les blocs de 20 chiffres détectent automatiquement leur banque ({RIP_PREFIX}, {NON_RIP_PREFIX}, 001 BNA, 002 BEA, 008 Trésor…).
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-1 rounded-md bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => setAccountFormat('non-rip')}
                    className={`rounded px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
                      accountFormat === 'non-rip'
                        ? 'bg-[#0F2942] text-white'
                        : 'text-slate-700 hover:text-slate-900'
                    }`}
                  >
                    non-RIP
                  </button>
                  <button
                    type="button"
                    onClick={() => setAccountFormat('rip')}
                    className={`rounded px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
                      accountFormat === 'rip'
                        ? 'bg-[#0F2942] text-white'
                        : 'text-slate-700 hover:text-slate-900'
                    }`}
                  >
                    RIP
                  </button>
                  <button
                    type="button"
                    onClick={() => setAccountFormat('bank-rib')}
                    className={`rounded px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
                      accountFormat === 'bank-rib'
                        ? 'bg-[#0F2942] text-white'
                        : 'text-slate-700 hover:text-slate-900'
                    }`}
                  >
                    RIB Banque
                  </button>
                </div>

                <div className="inline-flex items-center gap-1 rounded-md bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => setPolicy('algerie-poste')}
                    className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
                      policy === 'algerie-poste'
                        ? 'bg-white text-[#0F2942] shadow-sm'
                        : 'text-slate-700 hover:text-slate-900'
                    }`}
                  >
                    Algérie Poste
                  </button>
                  <button
                    type="button"
                    onClick={() => setPolicy('strict')}
                    className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
                      policy === 'strict'
                        ? 'bg-white text-[#0F2942] shadow-sm'
                        : 'text-slate-700 hover:text-slate-900'
                    }`}
                  >
                    Strict
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setBatchInput(MIXED_BATCH_SAMPLE)}
                  className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                >
                  Exemple mixte
                </button>
                <button
                  type="button"
                  onClick={() => setBatchInput('')}
                  className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                >
                  Vider
                </button>
                <button
                  type="button"
                  disabled={batchEval.rows.length === 0}
                  onClick={handleExportBatchCsv}
                  className="inline-flex items-center gap-1.5 rounded bg-[#0F2942] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#163A5C] disabled:opacity-45 whitespace-nowrap"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Exporter CSV ({batchEval.rows.length})</span>
                </button>
              </div>
            </div>

            {accountFormat === 'bank-rib' && (
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className={selectedBankChoice === 'custom' ? 'sm:col-span-6' : 'sm:col-span-8'}>
                  <label htmlFor="batch-bank-selector" className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Banque par défaut (pour les comptes saisis sans code banque)
                  </label>
                  <select
                    id="batch-bank-selector"
                    value={selectedBankChoice}
                    onChange={(e) => handleBankDropdownChange(e.target.value)}
                    className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900"
                  >
                    {ALGERIAN_BANKS.map((bank) => (
                      <option key={bank.code} value={bank.code}>
                        {bank.code} — {bank.shortName} ({bank.name})
                      </option>
                    ))}
                    <option value="custom">Autre code banque personnalisé...</option>
                  </select>
                </div>
                {selectedBankChoice === 'custom' && (
                  <div className="sm:col-span-2">
                    <label htmlFor="batch-custom-bank" className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Code banque
                    </label>
                    <input
                      id="batch-custom-bank"
                      type="text"
                      inputMode="numeric"
                      maxLength={3}
                      value={customBankCode}
                      onChange={(e) => setCustomBankCode(e.target.value.replace(/\D/g, '').slice(0, 3))}
                      className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900 tabular-nums"
                    />
                  </div>
                )}
                <div className="sm:col-span-4">
                  <label htmlFor="batch-agency-code" className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Code agence par défaut (5 ch.)
                  </label>
                  <input
                    id="batch-agency-code"
                    type="text"
                    inputMode="numeric"
                    maxLength={5}
                    value={bankAgencyCode}
                    onChange={(e) => setBankAgencyCode(e.target.value.replace(/\D/g, '').slice(0, 5))}
                    className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900 tabular-nums"
                  />
                </div>
              </div>
            )}

            <textarea
              id="batch-ccp-textarea"
              rows={5}
              value={batchInput}
              onChange={(e) => setBatchInput(e.target.value)}
              placeholder={'00799999000000504055\n00100101001234567844\n002;00050;456789;92\n00000000000030007686'}
              className="w-full rounded-md border border-slate-300 bg-white p-3 font-mono text-xs text-slate-900 placeholder:text-slate-400"
            />
          </div>

          <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 font-medium text-slate-600">
                <tr>
                  <th className="px-3 py-3 w-12">Ligne</th>
                  <th className="px-3 py-3">Format / Banque</th>
                  <th className="px-3 py-3">Compte (10 ch.)</th>
                  <th className="px-3 py-3">Clé CCP</th>
                  <th className="px-3 py-3">Clé RIP</th>
                  <th className="px-3 py-3">Clé RIB (Mod 97)</th>
                  <th className="px-3 py-3">Conformité clé</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {batchEval.rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                      Aucun compte saisi. Collez une liste de comptes CCP, RIP ou RIB bancaires dans la zone ci-dessus.
                    </td>
                  </tr>
                ) : (
                  batchEval.rows.map((row) => (
                    <tr key={row.lineNumber} className="hover:bg-slate-50/70">
                      <td className="px-3 py-2.5 font-mono text-slate-500 tabular-nums">{row.lineNumber}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {row.format === 'bank-rib' ? (
                          <span className="font-medium text-slate-800">
                            {row.bankCode} · {row.bankLabel}
                            {row.agencyCode ? (
                              <span className="ml-1 font-mono text-[11px] text-slate-500">({row.agencyCode})</span>
                            ) : null}
                          </span>
                        ) : (
                          <span className="font-medium text-slate-800">
                            {row.format === 'rip' ? 'RIP (007)' : 'non-RIP'}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 font-mono font-medium text-slate-900 tabular-nums">
                        {row.valid
                          ? privacyMode
                            ? maskAccountNumber(row.ccp10, true)
                            : row.ccp10
                          : row.inputRaw}
                      </td>
                      <td className="px-3 py-2.5 font-mono font-bold text-[#0F2942] tabular-nums">
                        {row.format === 'bank-rib' && row.bankCode !== '007' ? '—' : row.ccpKey}
                      </td>
                      <td className="px-3 py-2.5 font-mono font-bold text-emerald-700 tabular-nums">
                        {row.format === 'bank-rib' && row.bankCode !== '007' ? '—' : row.ripKey}
                      </td>
                      <td className="px-3 py-2.5 font-mono font-bold text-[#0F2942] tabular-nums">
                        {row.bankRibKey ?? '—'}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {!row.valid ? (
                          <span className="text-red-700 font-medium">{row.error}</span>
                        ) : row.complianceStatus === 'conforme' ? (
                          <span className="text-emerald-700 font-semibold">{row.complianceLabel}</span>
                        ) : row.complianceStatus === 'no-key' ? (
                          <span className="text-slate-500">{row.complianceLabel}</span>
                        ) : (
                          <span className="text-red-700 font-semibold">{row.complianceLabel}</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
