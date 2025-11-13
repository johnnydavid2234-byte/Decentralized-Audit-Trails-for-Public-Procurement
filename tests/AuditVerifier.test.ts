import { describe, it, expect, beforeEach } from "vitest";
import { stringUtf8CV, uintCV, noneCV, someCV, bufferCV, principalCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_TENDER_ID = 101;
const ERR_INVALID_BID_ID = 102;
const ERR_NO_TENDER_DATA = 104;
const ERR_NO_BID_DATA = 105;
const ERR_INVALID_HASH = 106;
const ERR_INVALID_STATUS = 107;
const ERR_DUPLICATE_QUERY = 111;
const ERR_INVALID_PRINCIPAL = 110;
const ERR_INVALID_REQUEST_ID = 114;
const ERR_INVALID_VERIFICATION = 113;

interface TenderAudit {
  tenderId: number;
  title: string;
  description: string;
  creator: string;
  timestamp: number;
  status: string;
  metadataHash: Buffer;
}

interface BidAudit {
  bidder: string;
  bidHash: Buffer;
  submissionTime: number;
  revealTime: number;
  score: number;
  metadata: string;
}

interface VerificationRequest {
  requester: string;
  tenderId: number;
  bidId: number | null;
  requestTime: number;
  verified: boolean;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class AuditVerifierMock {
  state: {
    requestCounter: number;
    authorityPrincipal: string | null;
    maxQueries: number;
    tenderAudits: Map<number, TenderAudit>;
    bidAudits: Map<{ tenderId: number; bidId: number }, BidAudit>;
    verificationRequests: Map<number, VerificationRequest>;
  } = {
    requestCounter: 0,
    authorityPrincipal: null,
    maxQueries: 1000,
    tenderAudits: new Map(),
    bidAudits: new Map(),
    verificationRequests: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  authorities: Set<string> = new Set(["ST1TEST"]);

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      requestCounter: 0,
      authorityPrincipal: null,
      maxQueries: 1000,
      tenderAudits: new Map(),
      bidAudits: new Map(),
      verificationRequests: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.authorities = new Set(["ST1TEST"]);
  }

  setAuthorityPrincipal(principal: string): Result<boolean> {
    if (principal === "SP000000000000000000002Q6VF78") return { ok: false, value: false };
    if (this.state.authorityPrincipal !== null) return { ok: false, value: false };
    this.state.authorityPrincipal = principal;
    return { ok: true, value: true };
  }

  requestTenderVerification(tenderId: number): Result<number> {
    if (tenderId <= 0) return { ok: false, value: ERR_INVALID_TENDER_ID };
    if (this.state.requestCounter >= this.state.maxQueries) return { ok: false, value: ERR_DUPLICATE_QUERY };
    if (!this.state.tenderAudits.has(tenderId)) return { ok: false, value: ERR_NO_TENDER_DATA };
    const requestId = this.state.requestCounter;
    this.state.verificationRequests.set(requestId, {
      requester: this.caller,
      tenderId,
      bidId: null,
      requestTime: this.blockHeight,
      verified: false,
    });
    this.state.requestCounter++;
    return { ok: true, value: requestId };
  }

  requestBidVerification(tenderId: number, bidId: number): Result<number> {
    if (tenderId <= 0) return { ok: false, value: ERR_INVALID_TENDER_ID };
    if (bidId <= 0) return { ok: false, value: ERR_INVALID_BID_ID };
    if (this.state.requestCounter >= this.state.maxQueries) return { ok: false, value: ERR_DUPLICATE_QUERY };
    if (!this.state.bidAudits.has({ tenderId, bidId })) return { ok: false, value: ERR_NO_BID_DATA };
    const requestId = this.state.requestCounter;
    this.state.verificationRequests.set(requestId, {
      requester: this.caller,
      tenderId,
      bidId,
      requestTime: this.blockHeight,
      verified: false,
    });
    this.state.requestCounter++;
    return { ok: true, value: requestId };
  }

  verifyRequest(requestId: number): Result<boolean> {
    const request = this.state.verificationRequests.get(requestId);
    if (!request) return { ok: false, value: false };
    if (!this.state.authorityPrincipal) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (request.verified) return { ok: false, value: ERR_INVALID_VERIFICATION };
    this.state.verificationRequests.set(requestId, { ...request, verified: true });
    return { ok: true, value: true };
  }

  getTenderAudit(tenderId: number): TenderAudit | null {
    return this.state.tenderAudits.get(tenderId) || null;
  }

  getRequestCount(): Result<number> {
    return { ok: true, value: this.state.requestCounter };
  }

  addTenderAudit(tender: TenderAudit) {
    this.state.tenderAudits.set(tender.tenderId, tender);
  }

  addBidAudit(tenderId: number, bidId: number, bid: BidAudit) {
    this.state.bidAudits.set({ tenderId, bidId }, bid);
  }
}

describe("AuditVerifier", () => {
  let contract: AuditVerifierMock;

  beforeEach(() => {
    contract = new AuditVerifierMock();
    contract.reset();
  });

  it("sets authority principal successfully", () => {
    const result = contract.setAuthorityPrincipal("ST2TEST");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.authorityPrincipal).toBe("ST2TEST");
  });

  it("rejects invalid authority principal", () => {
    const result = contract.setAuthorityPrincipal("SP000000000000000000002Q6VF78");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects authority principal if already set", () => {
    contract.setAuthorityPrincipal("ST2TEST");
    const result = contract.setAuthorityPrincipal("ST3TEST");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("requests tender verification successfully", () => {
    contract.setAuthorityPrincipal("ST2TEST");
    contract.addTenderAudit({
      tenderId: 1,
      title: "Road Construction",
      description: "Build highway",
      creator: "ST1TEST",
      timestamp: 100,
      status: "open",
      metadataHash: Buffer.from("a".repeat(32)),
    });
    const result = contract.requestTenderVerification(1);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const request = contract.state.verificationRequests.get(0);
    expect(request?.tenderId).toBe(1);
    expect(request?.requester).toBe("ST1TEST");
    expect(request?.verified).toBe(false);
  });

  it("rejects tender verification for invalid tender ID", () => {
    contract.setAuthorityPrincipal("ST2TEST");
    const result = contract.requestTenderVerification(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_TENDER_ID);
  });

  it("rejects tender verification for non-existent tender", () => {
    contract.setAuthorityPrincipal("ST2TEST");
    const result = contract.requestTenderVerification(1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NO_TENDER_DATA);
  });

  it("rejects bid verification for invalid bid ID", () => {
    contract.setAuthorityPrincipal("ST2TEST");
    const result = contract.requestBidVerification(1, 0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_BID_ID);
  });

  it("rejects bid verification for non-existent bid", () => {
    contract.setAuthorityPrincipal("ST2TEST");
    const result = contract.requestBidVerification(1, 1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NO_BID_DATA);
  });

  it("verifies request successfully", () => {
    contract.setAuthorityPrincipal("ST2TEST");
    contract.addTenderAudit({
      tenderId: 1,
      title: "Road Construction",
      description: "Build highway",
      creator: "ST1TEST",
      timestamp: 100,
      status: "open",
      metadataHash: Buffer.from("a".repeat(32)),
    });
    contract.requestTenderVerification(1);
    const result = contract.verifyRequest(0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const request = contract.state.verificationRequests.get(0);
    expect(request?.verified).toBe(true);
  });

  it("rejects verification for non-existent request", () => {
    contract.setAuthorityPrincipal("ST2TEST");
    const result = contract.verifyRequest(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects verification without authority principal", () => {
    contract.addTenderAudit({
      tenderId: 1,
      title: "Road Construction",
      description: "Build highway",
      creator: "ST1TEST",
      timestamp: 100,
      status: "open",
      metadataHash: Buffer.from("a".repeat(32)),
    });
    contract.requestTenderVerification(1);
    const result = contract.verifyRequest(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("rejects verification for already verified request", () => {
    contract.setAuthorityPrincipal("ST2TEST");
    contract.addTenderAudit({
      tenderId: 1,
      title: "Road Construction",
      description: "Build highway",
      creator: "ST1TEST",
      timestamp: 100,
      status: "open",
      metadataHash: Buffer.from("a".repeat(32)),
    });
    contract.requestTenderVerification(1);
    contract.verifyRequest(0);
    const result = contract.verifyRequest(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_VERIFICATION);
  });

  it("returns correct request count", () => {
    contract.setAuthorityPrincipal("ST2TEST");
    contract.addTenderAudit({
      tenderId: 1,
      title: "Road Construction",
      description: "Build highway",
      creator: "ST1TEST",
      timestamp: 100,
      status: "open",
      metadataHash: Buffer.from("a".repeat(32)),
    });
    contract.requestTenderVerification(1);
    contract.requestTenderVerification(1);
    const result = contract.getRequestCount();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });

  it("rejects tender verification when max queries exceeded", () => {
    contract.setAuthorityPrincipal("ST2TEST");
    contract.addTenderAudit({
      tenderId: 1,
      title: "Road Construction",
      description: "Build highway",
      creator: "ST1TEST",
      timestamp: 100,
      status: "open",
      metadataHash: Buffer.from("a".repeat(32)),
    });
    contract.state.maxQueries = 1;
    contract.requestTenderVerification(1);
    const result = contract.requestTenderVerification(1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_DUPLICATE_QUERY);
  });
});