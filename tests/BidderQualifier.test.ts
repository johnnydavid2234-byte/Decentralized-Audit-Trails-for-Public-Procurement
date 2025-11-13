import { describe, it, expect, beforeEach } from "vitest";
import {
  stringUtf8CV,
  uintCV,
  bufferCV,
  principalCV,
} from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_QUALIFICATION_HASH = 102;
const ERR_INVALID_PROOF_HASH = 103;
const ERR_INVALID_FINANCIAL_PROOF = 107;
const ERR_INVALID_LICENSE = 108;
const ERR_BIDDER_ALREADY_REGISTERED = 105;
const ERR_BIDDER_NOT_FOUND = 106;
const ERR_QUALIFICATION_NOT_MET = 109;
const ERR_MAX_BIDDERS_EXCEEDED = 110;
const ERR_INVALID_CRITERIA = 111;
const ERR_INVALID_EXPERIENCE = 113;
const ERR_INVALID_STATUS = 114;

interface Bidder {
  id: number;
  principal: string;
  qualificationHash: Buffer;
  proofHash: Buffer;
  financialProof: number;
  licenseHash: Buffer;
  experienceYears: number;
  status: string;
  registeredAt: number;
}

interface BidderQualification {
  qualified: boolean;
  criteriaMet: string;
  qualifiedAt: number;
}

interface QualificationCriteria {
  tenderId: number;
  minFinancial: number;
  requiredLicense: string;
  minExperience: number;
  docHash: Buffer;
  setBy: string;
  setAt: number;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class BidderQualifierMock {
  state: {
    nextBidderId: number;
    maxBidders: number;
    authorityPrincipal: string | null;
    qualificationFee: number;
    bidders: Map<number, Bidder>;
    bidderQualifications: Map<
      { bidderId: number; tenderId: number },
      BidderQualification
    >;
    qualificationCriteria: Map<number, QualificationCriteria>;
    biddersByPrincipal: Map<string, number>;
  } = {
    nextBidderId: 0,
    maxBidders: 1000,
    authorityPrincipal: null,
    qualificationFee: 200,
    bidders: new Map(),
    bidderQualifications: new Map(),
    qualificationCriteria: new Map(),
    biddersByPrincipal: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  stxTransfers: Array<{ amount: number; from: string; to: string | null }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextBidderId: 0,
      maxBidders: 1000,
      authorityPrincipal: null,
      qualificationFee: 200,
      bidders: new Map(),
      bidderQualifications: new Map(),
      qualificationCriteria: new Map(),
      biddersByPrincipal: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.stxTransfers = [];
  }

  setAuthorityPrincipal(principal: string): Result<boolean> {
    if (principal === "SP000000000000000000002Q6VF78")
      return { ok: false, value: false };
    if (this.state.authorityPrincipal !== null)
      return { ok: false, value: false };
    this.state.authorityPrincipal = principal;
    return { ok: true, value: true };
  }

  setMaxBidders(newMax: number): Result<boolean> {
    if (newMax <= 0) return { ok: false, value: false };
    if (!this.state.authorityPrincipal)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.maxBidders = newMax;
    return { ok: true, value: true };
  }

  setQualificationFee(newFee: number): Result<boolean> {
    if (newFee < 0) return { ok: false, value: false };
    if (!this.state.authorityPrincipal)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.qualificationFee = newFee;
    return { ok: true, value: true };
  }

  registerBidder(
    qualificationHash: Buffer,
    proofHash: Buffer,
    financialProof: number,
    licenseHash: Buffer,
    experienceYears: number
  ): Result<number> {
    if (this.state.nextBidderId >= this.state.maxBidders)
      return { ok: false, value: ERR_MAX_BIDDERS_EXCEEDED };
    if (qualificationHash.length === 0)
      return { ok: false, value: ERR_INVALID_QUALIFICATION_HASH };
    if (proofHash.length === 0)
      return { ok: false, value: ERR_INVALID_PROOF_HASH };
    if (financialProof <= 0)
      return { ok: false, value: ERR_INVALID_FINANCIAL_PROOF };
    if (licenseHash.length === 0)
      return { ok: false, value: ERR_INVALID_LICENSE };
    if (experienceYears < 0)
      return { ok: false, value: ERR_INVALID_EXPERIENCE };
    if (this.state.biddersByPrincipal.has(this.caller))
      return { ok: false, value: ERR_BIDDER_ALREADY_REGISTERED };
    if (this.state.authorityPrincipal) {
      this.stxTransfers.push({
        amount: this.state.qualificationFee,
        from: this.caller,
        to: this.state.authorityPrincipal,
      });
    }
    const id = this.state.nextBidderId;
    const bidder: Bidder = {
      id,
      principal: this.caller,
      qualificationHash,
      proofHash,
      financialProof,
      licenseHash,
      experienceYears,
      status: "pending",
      registeredAt: this.blockHeight,
    };
    this.state.bidders.set(id, bidder);
    this.state.biddersByPrincipal.set(this.caller, id);
    this.state.nextBidderId++;
    return { ok: true, value: id };
  }

  setQualificationCriteria(
    tenderId: number,
    minFinancial: number,
    requiredLicense: string,
    minExperience: number,
    docHash: Buffer
  ): Result<boolean> {
    if (!this.state.authorityPrincipal)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (minFinancial <= 0)
      return { ok: false, value: ERR_INVALID_FINANCIAL_PROOF };
    if (minExperience < 0) return { ok: false, value: ERR_INVALID_EXPERIENCE };
    if (docHash.length === 0) return { ok: false, value: ERR_INVALID_DOC_HASH };
    const criteria: QualificationCriteria = {
      tenderId,
      minFinancial,
      requiredLicense,
      minExperience,
      docHash,
      setBy: this.caller,
      setAt: this.blockHeight,
    };
    this.state.qualificationCriteria.set(tenderId, criteria);
    return { ok: true, value: true };
  }

  qualifyBidderForTender(bidderId: number, tenderId: number): Result<boolean> {
    const bidder = this.state.bidders.get(bidderId);
    if (!bidder) return { ok: false, value: ERR_BIDDER_NOT_FOUND };
    const criteria = this.state.qualificationCriteria.get(tenderId);
    if (!criteria) return { ok: false, value: ERR_INVALID_CRITERIA };
    if (bidder.principal !== this.caller)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (bidder.status !== "pending")
      return { ok: false, value: ERR_INVALID_STATUS };
    const meetsFinancial = bidder.financialProof >= criteria.minFinancial;
    const meetsExperience = bidder.experienceYears >= criteria.minExperience;
    const meetsLicense =
      Buffer.compare(bidder.licenseHash, criteria.docHash) === 0;
    const qualified = meetsFinancial && meetsExperience && meetsLicense;
    const criteriaMet = qualified ? "all-criteria-met" : "partial-match";
    this.state.bidders.set(bidderId, {
      ...bidder,
      status: qualified ? "qualified" : "rejected",
    });
    this.state.bidderQualifications.set(
      { bidderId, tenderId },
      {
        qualified,
        criteriaMet,
        qualifiedAt: this.blockHeight,
      }
    );
    return { ok: true, value: qualified };
  }

  updateBidderStatus(bidderId: number, newStatus: string): Result<boolean> {
    const bidder = this.state.bidders.get(bidderId);
    if (!bidder) return { ok: false, value: ERR_BIDDER_NOT_FOUND };
    if (!this.state.authorityPrincipal)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (!["qualified", "pending", "rejected"].includes(newStatus))
      return { ok: false, value: ERR_INVALID_STATUS };
    this.state.bidders.set(bidderId, { ...bidder, status: newStatus });
    return { ok: true, value: true };
  }

  getBidder(bidderId: number): Bidder | null {
    return this.state.bidders.get(bidderId) || null;
  }

  getBidderCount(): Result<number> {
    return { ok: true, value: this.state.nextBidderId };
  }
}

describe("BidderQualifier", () => {
  let contract: BidderQualifierMock;

  beforeEach(() => {
    contract = new BidderQualifierMock();
    contract.reset();
  });

  it("sets authority principal successfully", () => {
    const result = contract.setAuthorityPrincipal("ST2TEST");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.authorityPrincipal).toBe("ST2TEST");
  });

  it("rejects invalid authority principal", () => {
    const result = contract.setAuthorityPrincipal(
      "SP000000000000000000002Q6VF78"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects setting authority if already set", () => {
    contract.setAuthorityPrincipal("ST2TEST");
    const result = contract.setAuthorityPrincipal("ST3TEST");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("registers bidder successfully", () => {
    contract.setAuthorityPrincipal("ST2TEST");
    const qualHash = Buffer.from("q".repeat(32));
    const proofHash = Buffer.from("p".repeat(32));
    const licenseHash = Buffer.from("l".repeat(32));
    const result = contract.registerBidder(
      qualHash,
      proofHash,
      50000,
      licenseHash,
      5
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const bidder = contract.getBidder(0);
    expect(bidder?.principal).toBe("ST1TEST");
    expect(bidder?.qualificationHash).toEqual(qualHash);
    expect(bidder?.financialProof).toBe(50000);
    expect(bidder?.status).toBe("pending");
    expect(contract.stxTransfers).toEqual([
      { amount: 200, from: "ST1TEST", to: "ST2TEST" },
    ]);
  });

  it("rejects bidder registration with duplicate principal", () => {
    contract.setAuthorityPrincipal("ST2TEST");
    contract.registerBidder(
      Buffer.from("q".repeat(32)),
      Buffer.from("p".repeat(32)),
      50000,
      Buffer.from("l".repeat(32)),
      5
    );
    const result = contract.registerBidder(
      Buffer.from("q2".repeat(32)),
      Buffer.from("p2".repeat(32)),
      60000,
      Buffer.from("l2".repeat(32)),
      6
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_BIDDER_ALREADY_REGISTERED);
  });

  it("rejects registration with invalid qualification hash", () => {
    contract.setAuthorityPrincipal("ST2TEST");
    const result = contract.registerBidder(
      Buffer.from(""),
      Buffer.from("p".repeat(32)),
      50000,
      Buffer.from("l".repeat(32)),
      5
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_QUALIFICATION_HASH);
  });

  it("rejects registration with invalid proof hash", () => {
    contract.setAuthorityPrincipal("ST2TEST");
    const result = contract.registerBidder(
      Buffer.from("q".repeat(32)),
      Buffer.from(""),
      50000,
      Buffer.from("l".repeat(32)),
      5
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_PROOF_HASH);
  });

  it("rejects registration with zero financial proof", () => {
    contract.setAuthorityPrincipal("ST2TEST");
    const result = contract.registerBidder(
      Buffer.from("q".repeat(32)),
      Buffer.from("p".repeat(32)),
      0,
      Buffer.from("l".repeat(32)),
      5
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_FINANCIAL_PROOF);
  });

  it("rejects registration with invalid license hash", () => {
    contract.setAuthorityPrincipal("ST2TEST");
    const result = contract.registerBidder(
      Buffer.from("q".repeat(32)),
      Buffer.from("p".repeat(32)),
      50000,
      Buffer.from(""),
      5
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_LICENSE);
  });

  it("rejects registration with negative experience", () => {
    contract.setAuthorityPrincipal("ST2TEST");
    const result = contract.registerBidder(
      Buffer.from("q".repeat(32)),
      Buffer.from("p".repeat(32)),
      50000,
      Buffer.from("l".repeat(32)),
      -1
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_EXPERIENCE);
  });

  it("rejects registration when max bidders exceeded", () => {
    contract.setAuthorityPrincipal("ST2TEST");
    contract.state.maxBidders = 1;
    contract.registerBidder(
      Buffer.from("q".repeat(32)),
      Buffer.from("p".repeat(32)),
      50000,
      Buffer.from("l".repeat(32)),
      5
    );
    const result = contract.registerBidder(
      Buffer.from("q2".repeat(32)),
      Buffer.from("p2".repeat(32)),
      60000,
      Buffer.from("l2".repeat(32)),
      6
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_BIDDERS_EXCEEDED);
  });

  it("sets qualification criteria successfully", () => {
    contract.setAuthorityPrincipal("ST2TEST");
    const docHash = Buffer.from("d".repeat(32));
    const result = contract.setQualificationCriteria(
      1,
      40000,
      "construction-license",
      3,
      docHash
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const criteria = contract.state.qualificationCriteria.get(1);
    expect(criteria?.minFinancial).toBe(40000);
    expect(criteria?.requiredLicense).toBe("construction-license");
    expect(criteria?.minExperience).toBe(3);
    expect(criteria?.docHash).toEqual(docHash);
  });

  it("rejects setting criteria without authority", () => {
    const result = contract.setQualificationCriteria(
      1,
      40000,
      "license",
      3,
      Buffer.from("d".repeat(32))
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("rejects setting criteria with zero min financial", () => {
    contract.setAuthorityPrincipal("ST2TEST");
    const result = contract.setQualificationCriteria(
      1,
      0,
      "license",
      3,
      Buffer.from("d".repeat(32))
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_FINANCIAL_PROOF);
  });

  it("rejects setting criteria with negative min experience", () => {
    contract.setAuthorityPrincipal("ST2TEST");
    const result = contract.setQualificationCriteria(
      1,
      40000,
      "license",
      -1,
      Buffer.from("d".repeat(32))
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_EXPERIENCE);
  });

  it("rejects qualification for non-existent bidder", () => {
    contract.setAuthorityPrincipal("ST2TEST");
    contract.setQualificationCriteria(
      1,
      40000,
      "license",
      3,
      Buffer.from("d".repeat(32))
    );
    const result = contract.qualifyBidderForTender(99, 1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_BIDDER_NOT_FOUND);
  });

  it("rejects qualification without criteria", () => {
    contract.setAuthorityPrincipal("ST2TEST");
    contract.registerBidder(
      Buffer.from("q".repeat(32)),
      Buffer.from("p".repeat(32)),
      50000,
      Buffer.from("l".repeat(32)),
      5
    );
    const result = contract.qualifyBidderForTender(0, 1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_CRITERIA);
  });

  it("rejects qualification by non-principal", () => {
    contract.setAuthorityPrincipal("ST2TEST");
    contract.registerBidder(
      Buffer.from("q".repeat(32)),
      Buffer.from("p".repeat(32)),
      50000,
      Buffer.from("l".repeat(32)),
      5
    );
    contract.setQualificationCriteria(
      1,
      40000,
      "license",
      3,
      Buffer.from("d".repeat(32))
    );
    contract.caller = "ST3FAKE";
    const result = contract.qualifyBidderForTender(0, 1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("rejects qualification for non-pending status", () => {
    contract.setAuthorityPrincipal("ST2TEST");
    contract.registerBidder(
      Buffer.from("q".repeat(32)),
      Buffer.from("p".repeat(32)),
      50000,
      Buffer.from("l".repeat(32)),
      5
    );
    contract.setQualificationCriteria(
      1,
      40000,
      "license",
      3,
      Buffer.from("l".repeat(32))
    );
    contract.qualifyBidderForTender(0, 1);
    const result = contract.qualifyBidderForTender(0, 1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_STATUS);
  });

  it("updates bidder status successfully", () => {
    contract.setAuthorityPrincipal("ST2TEST");
    contract.registerBidder(
      Buffer.from("q".repeat(32)),
      Buffer.from("p".repeat(32)),
      50000,
      Buffer.from("l".repeat(32)),
      5
    );
    const result = contract.updateBidderStatus(0, "qualified");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const bidder = contract.getBidder(0);
    expect(bidder?.status).toBe("qualified");
  });

  it("rejects status update for non-existent bidder", () => {
    contract.setAuthorityPrincipal("ST2TEST");
    const result = contract.updateBidderStatus(99, "qualified");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_BIDDER_NOT_FOUND);
  });

  it("rejects status update without authority", () => {
    contract.registerBidder(
      Buffer.from("q".repeat(32)),
      Buffer.from("p".repeat(32)),
      50000,
      Buffer.from("l".repeat(32)),
      5
    );
    const result = contract.updateBidderStatus(0, "qualified");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("rejects invalid status update", () => {
    contract.setAuthorityPrincipal("ST2TEST");
    contract.registerBidder(
      Buffer.from("q".repeat(32)),
      Buffer.from("p".repeat(32)),
      50000,
      Buffer.from("l".repeat(32)),
      5
    );
    const result = contract.updateBidderStatus(0, "invalid");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_STATUS);
  });
});
