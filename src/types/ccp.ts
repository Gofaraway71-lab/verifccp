export type FormatKind = 'rip' | 'non-rip' | 'rib';
export type StructureType = 'fixed-62' | 'delimited' | 'spreadsheet';
export type Severity = 'critical' | 'error' | 'warning' | 'info';
export type RuleOrigin = 'confirmed' | 'configurable';
export type KeyAlgorithm = 'rip-mod97-85' | 'rip-mod97-std' | 'ccp-weighted' | 'ccp-or-rip' | 'bank-rib-mod97' | 'none';
export type LineEndingType = 'CRLF' | 'LF' | 'MIXED' | 'NONE';
export type FileStatus = 'conforme' | 'non-conforme' | 'a-verifier';

export type AnomalyCategory =
  | 'structure'
  | 'rip'
  | 'non-rip'
  | 'key'
  | 'amount'
  | 'coherence'
  | 'duplicate'
  | 'field'
  | 'encoding';

export interface RuleConfig {
  id: string;
  code: string;
  name: string;
  description: string;
  category: AnomalyCategory;
  severity: Severity;
  enabled: boolean;
  origin: RuleOrigin;
  appliesTo: FormatKind | 'both';
}

export interface ValidationProfile {
  id: string;
  name: string;
  description: string;
  formatKind: FormatKind;
  structure: StructureType;
  isBuiltIn: boolean;
  isVerifiedOnSample: boolean;
  encoding: 'UTF-8' | 'Windows-1252' | 'Windows-1256' | 'AUTO';
  expectedLineEnding: 'CRLF' | 'LF' | 'ANY';
  // Fixed-width 62-char Algérie Poste parameters
  fixedLineLength: number;
  linePrefixChar: string;
  accountPrefixExpected: string; // '00799999' for RIP, '00000000' for non-RIP
  forbiddenAccountPrefix: string; // '00000000' for RIP, '00799999' for non-RIP
  headerTypeCode: string; // '0'
  detailTypeCode: string; // '1'
  headerKeyAlgorithm: KeyAlgorithm;
  detailKeyAlgorithm: KeyAlgorithm;
  allowArabicNames: boolean;
  allowAccentedNames: boolean;
  amountImpliedDecimals: number; // 2 (centimes -> DA)
  minAmountCentimes: number; // 1 (0,01 DA)
  maxAmountCentimes: number; // 9999999999999
  // RIB specific options
  detectAndValidateRib?: boolean;
  convertRibToCcp?: boolean;
  // Delimited / spreadsheet parameters
  delimiter: ';' | ',' | '\t' | '|';
  hasHeaderRow: boolean;
  expectedColumns: number;
  columnMap: {
    account: number;
    key?: number;
    amount: number;
    beneficiary: number;
  };
  rules: RuleConfig[];
}

export interface DecodedFileResult {
  fileName: string;
  fileSize: number;
  extension: string;
  rawText: string;
  detectedEncoding: string;
  hasBom: boolean;
  hasReplacementChars: boolean;
  invisibleCharCount: number;
  lineEnding: LineEndingType;
  rawLines: string[];
  /** Spreadsheet rows if XLS/XLSX */
  spreadsheetRows?: string[][];
  parseWarnings: string[];
}

export interface FormatDetectionResult {
  detectedFormat: FormatKind | 'ambiguous' | 'unknown';
  detectedStructure: StructureType | 'unknown';
  suggestedProfileId: string | null;
  confidence: number; // 0..100
  delimiter?: ';' | ',' | '\t' | '|';
  columnCount?: number;
  hasHeader: boolean;
  lineCount: number;
  ripPrefixCount: number;
  nonRipPrefixCount: number;
  ribPrefixCount?: number;
  otherPrefixCount: number;
  reasons: string[];
  warnings: string[];
}

export interface ParsedRecord {
  lineNumber: number; // 1-indexed
  rawLine: string;
  lineLength: number;
  kind: 'header' | 'detail' | 'empty' | 'malformed';
  prefixChar?: string;
  accountFull20?: string;
  accountPrefix8?: string;
  ccp10?: string;
  key2?: string;
  amountRaw?: string;
  amountCentimes?: number;
  // Header specific (Line 1)
  declaredCountRaw?: string;
  declaredCount?: number;
  monthRaw?: string;
  yearRaw?: string;
  reservedSpacesRaw?: string;
  // Detail specific (Lines 2..N)
  beneficiaryRaw?: string;
  beneficiaryTrimmed?: string;
  typeCode?: string;
  bankRibDetails?: {
    bankCode: string;
    branchCode: string;
    accountNumber: string;
    actualKey: string;
    expectedKey: string;
    validBankKey: boolean;
    ccpEquivalent?: string;
  };
  // Valid status after validation
  isValid: boolean;
  hasCriticalOrError: boolean;
  hasWarning: boolean;
  anomalyIds: string[];
}

export interface Anomaly {
  id: string;
  ruleId: string;
  ruleCode: string;
  lineNumber: number; // 0 for global file-level anomalies
  recordIdentifier: string; // Masked at render time if privacy mode is ON
  field: string;
  detectedValue: string;
  expectedRule: string;
  description: string;
  severity: Severity;
  category: AnomalyCategory;
  formatScope: FormatKind | 'both';
  suggestion?: string;
}

export interface AnalysisSummary {
  totalLines: number;
  nonEmptyLines: number;
  emptyLines: number;
  headerCount: number;
  beneficiaryCount: number;
  validRecords: number;
  invalidRecords: number;
  warningRecords: number;
  duplicateAccounts: number;
  repeatedLines: number;
  declaredTotalCentimes: number | null;
  computedTotalCentimes: number;
  declaredBeneficiaryCount: number | null;
  headerPeriod: string | null; // e.g., "11/2026"
  ordonnateurAccount: string | null;
  countsBySeverity: Record<Severity, number>;
  countsByCategory: Record<AnomalyCategory, number>;
}

export interface SafeCorrectionChange {
  lineNumber: number;
  reason: string;
  original: string;
  corrected: string;
}

export interface SafeCorrectionProposal {
  hasChanges: boolean;
  summary: string[];
  correctedContent: string;
  changes: SafeCorrectionChange[];
  targetLineEnding: 'CRLF' | 'LF';
}

export interface AnalysisReport {
  id: string;
  analyzedAt: string; // ISO timestamp
  durationMs: number;
  fileName: string;
  fileSize: number;
  profileId: string;
  profileName: string;
  profileFormat: FormatKind;
  structure: StructureType;
  status: FileStatus;
  detection: FormatDetectionResult;
  decoded: {
    detectedEncoding: string;
    hasBom: boolean;
    hasReplacementChars: boolean;
    invisibleCharCount: number;
    lineEnding: LineEndingType;
  };
  summary: AnalysisSummary;
  records: ParsedRecord[];
  anomalies: Anomaly[];
  safeCorrection: SafeCorrectionProposal;
  originalRawText: string;
  profileMismatchWarning: boolean;
}

export interface HistoryEntry {
  id: string;
  analyzedAt: string;
  fileName: string;
  fileSize: number;
  profileName: string;
  profileFormat: FormatKind;
  status: FileStatus;
  beneficiaryCount: number;
  validRecords: number;
  invalidRecords: number;
  totalAnomalies: number;
  criticalCount: number;
  errorCount: number;
  warningCount: number;
  computedTotalCentimes: number;
}

export interface AutomatedTestResult {
  id: string;
  name: string;
  category: string;
  formatTested: FormatKind | 'both';
  passed: boolean;
  durationMs: number;
  expectedSummary: string;
  actualSummary: string;
  sampleFileName?: string;
  sampleContent?: string;
}
