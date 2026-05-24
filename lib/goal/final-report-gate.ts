import type { DeliveryEvidence } from "../../extensions/development-goal/domain.ts";
import {
  parseFinalReport,
  parseLoopDeliveryEvidence,
  type FinalReport,
  type FinalReportParseError,
  type ReportQualityIssue,
  type ReportQualityIssueCode,
} from "./report-parser.ts";

export type FinalReportGateState = {
  usedReportRepairRetry?: boolean;
};

export type FinalReportGateResult =
  | {
      action: "accept";
      report: FinalReport;
      deliveryEvidence: DeliveryEvidence;
      issueCodes: [];
    }
  | {
      action: "repair";
      report: FinalReport;
      deliveryEvidence: DeliveryEvidence;
      issueCodes: ReportQualityIssueCode[];
      logEvent: {
        event: "malformed_final_report_repair_requested";
        reason: "malformed_final_report";
        blockerKind: "malformed_final_report";
        reportQualityIssueCodes: ReportQualityIssueCode[];
      };
    }
  | {
      action: "block";
      report: FinalReport;
      deliveryEvidence: DeliveryEvidence;
      issueCodes: ReportQualityIssueCode[];
      blockerKind: "malformed_final_report";
      blockerState: string;
      logEvent: {
        reason: "malformed_final_report";
        blockerKind: "malformed_final_report";
        blockerState: string;
        reportQualityIssueCodes: ReportQualityIssueCode[];
      };
    }
  | {
      action: "parse_error";
      error: FinalReportParseError;
      deliveryEvidence: DeliveryEvidence;
    };

export function evaluateFinalReportGate(text: string, state: FinalReportGateState = {}): FinalReportGateResult {
  const finalReportResult = parseFinalReport(text);
  const deliveryEvidence = finalReportResult.ok && Object.keys(finalReportResult.report.deliveryEvidence).length > 0
    ? finalReportResult.report.deliveryEvidence
    : parseLoopDeliveryEvidence(text);

  if (!finalReportResult.ok) {
    return {
      action: "parse_error",
      error: finalReportResult.error,
      deliveryEvidence,
    };
  }

  const report = finalReportResult.report;
  if (report.quality.valid) {
    return {
      action: "accept",
      report,
      deliveryEvidence,
      issueCodes: [],
    };
  }

  const issueCodes = reportQualityIssueCodes(report.quality.issues);
  if (!state.usedReportRepairRetry) {
    return {
      action: "repair",
      report,
      deliveryEvidence,
      issueCodes,
      logEvent: {
        event: "malformed_final_report_repair_requested",
        reason: "malformed_final_report",
        blockerKind: "malformed_final_report",
        reportQualityIssueCodes: issueCodes,
      },
    };
  }

  const blockerState = issueCodes.join("; ") || "malformed_final_report";
  return {
    action: "block",
    report,
    deliveryEvidence,
    issueCodes,
    blockerKind: "malformed_final_report",
    blockerState,
    logEvent: {
      reason: "malformed_final_report",
      blockerKind: "malformed_final_report",
      blockerState,
      reportQualityIssueCodes: issueCodes,
    },
  };
}

function reportQualityIssueCodes(issues: ReportQualityIssue[]): ReportQualityIssueCode[] {
  const seen = new Set<ReportQualityIssueCode>();
  const codes: ReportQualityIssueCode[] = [];
  for (const issue of issues) {
    if (seen.has(issue.code)) continue;
    seen.add(issue.code);
    codes.push(issue.code);
  }
  return codes;
}
