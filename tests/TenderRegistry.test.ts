import { describe, it, expect, beforeEach } from "vitest";
import {
  stringUtf8CV,
  uintCV,
  bufferCV,
  principalCV,
} from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_TITLE = 102;
const ERR_INVALID_DESCRIPTION = 103;
const ERR_INVALID_DEADLINE = 104;
const ERR_INVALID_ELIGIBILITY = 105;
const ERR_TENDER_ALREADY_EXISTS = 106;
const ERR_TENDER_NOT_FOUND = 107;
const ERR_INVALID_BUDGET = 108;
const ERR_INVALID_CATEGORY = 109;
const ERR_INVALID_STATUS = 110;
const ERR_MAX_TENDERS_EXCEEDED = 111;
const ERR_INVALID_METADATA_HASH = 112;
const ERR_INVALID_CREATOR = 113;

interface Tender {
  id: number;
  title: string;
  description: string;
  creator: string;
  deadline: number;
  eligibility: string;
  budget: number;
  category: string;
  status: string;
  createdAt: number;
  metadataHash: Buffer;
}

interface TenderUpdate {
  updatedTitle: string;
  updatedDescription: string;
  updatedDeadline: number;
  updatedBy: string;
  updatedAt: number;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class TenderRegistryMock {
  state: {
    nextTenderId: number;
    maxTenders: number;
    authorityPrincipal: string | null;
    registrationFee: number;
    tenders: Map<number, Tender>;
    tendersByTitle: Map<string, number>;
    tenderUpdates: Map<number, TenderUpdate>;
  } = {
    nextTenderId: 0,
    maxTenders: 500,
    authorityPrincipal: null,
    registrationFee: 500,
    tenders: new Map(),
    tendersByTitle: new Map(),
    tenderUpdates: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  stxTransfers: Array<{ amount: number; from: string; to: string | null }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextTenderId: 0,
      maxTenders: 500,
      authorityPrincipal: null,
      registrationFee: 500,
      tenders: new Map(),
      tendersByTitle: new Map(),
      tenderUpdates: new Map(),
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

  setMaxTenders(newMax: number): Result<boolean> {
    if (newMax <= 0) return { ok: false, value: false };
    if (!this.state.authorityPrincipal)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.maxTenders = newMax;
    return { ok: true, value: true };
  }

  setRegistrationFee(newFee: number): Result<boolean> {
    if (newFee < 0) return { ok: false, value: false };
    if (!this.state.authorityPrincipal)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.registrationFee = newFee;
    return { ok: true, value: true };
  }

  createTender(
    title: string,
    description: string,
    deadline: number,
    eligibility: string,
    budget: number,
    category: string,
    metadataHash: Buffer
  ): Result<number> {
    if (this.state.nextTenderId >= this.state.maxTenders)
      return { ok: false, value: ERR_MAX_TENDERS_EXCEEDED };
    if (title.length === 0 || title.length > 100)
      return { ok: false, value: ERR_INVALID_TITLE };
    if (description.length === 0 || description.length > 500)
      return { ok: false, value: ERR_INVALID_DESCRIPTION };
    if (deadline <= this.blockHeight)
      return { ok: false, value: ERR_INVALID_DEADLINE };
    if (eligibility.length === 0 || eligibility.length > 200)
      return { ok: false, value: ERR_INVALID_ELIGIBILITY };
    if (budget <= 0) return { ok: false, value: ERR_INVALID_BUDGET };
    if (!["infrastructure", "services", "goods"].includes(category))
      return { ok: false, value: ERR_INVALID_CATEGORY };
    if (metadataHash.length === 0)
      return { ok: false, value: ERR_INVALID_METADATA_HASH };
    if (this.state.tendersByTitle.has(title))
      return { ok: false, value: ERR_TENDER_ALREADY_EXISTS };
    if (this.state.authorityPrincipal) {
      this.stxTransfers.push({
        amount: this.state.registrationFee,
        from: this.caller,
        to: this.state.authorityPrincipal,
      });
    }
    const id = this.state.nextTenderId;
    const tender: Tender = {
      id,
      title,
      description,
      creator: this.caller,
      deadline,
      eligibility,
      budget,
      category,
      status: "open",
      createdAt: this.blockHeight,
      metadataHash,
    };
    this.state.tenders.set(id, tender);
    this.state.tendersByTitle.set(title, id);
    this.state.nextTenderId++;
    return { ok: true, value: id };
  }

  updateTender(
    id: number,
    newTitle: string,
    newDescription: string,
    newDeadline: number
  ): Result<boolean> {
    const tender = this.state.tenders.get(id);
    if (!tender) return { ok: false, value: ERR_TENDER_NOT_FOUND };
    if (tender.creator !== this.caller)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newTitle.length === 0 || newTitle.length > 100)
      return { ok: false, value: ERR_INVALID_TITLE };
    if (newDescription.length === 0 || newDescription.length > 500)
      return { ok: false, value: ERR_INVALID_DESCRIPTION };
    if (newDeadline <= this.blockHeight)
      return { ok: false, value: ERR_INVALID_DEADLINE };
    if (
      this.state.tendersByTitle.has(newTitle) &&
      this.state.tendersByTitle.get(newTitle) !== id
    ) {
      return { ok: false, value: ERR_TENDER_ALREADY_EXISTS };
    }
    if (newTitle !== tender.title) {
      this.state.tendersByTitle.delete(tender.title);
      this.state.tendersByTitle.set(newTitle, id);
    }
    const updated: Tender = {
      ...tender,
      title: newTitle,
      description: newDescription,
      deadline: newDeadline,
    };
    this.state.tenders.set(id, updated);
    this.state.tenderUpdates.set(id, {
      updatedTitle: newTitle,
      updatedDescription: newDescription,
      updatedDeadline: newDeadline,
      updatedBy: this.caller,
      updatedAt: this.blockHeight,
    });
    return { ok: true, value: true };
  }

  closeTender(id: number): Result<boolean> {
    const tender = this.state.tenders.get(id);
    if (!tender) return { ok: false, value: ERR_TENDER_NOT_FOUND };
    if (tender.creator !== this.caller)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (tender.status !== "open")
      return { ok: false, value: ERR_INVALID_STATUS };
    this.state.tenders.set(id, { ...tender, status: "closed" });
    return { ok: true, value: true };
  }

  getTender(id: number): Tender | null {
    return this.state.tenders.get(id) || null;
  }

  getTenderCount(): Result<number> {
    return { ok: true, value: this.state.nextTenderId };
  }
}

describe("TenderRegistry", () => {
  let contract: TenderRegistryMock;

  beforeEach(() => {
    contract = new TenderRegistryMock();
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

  it("creates a tender successfully", () => {
    contract.setAuthorityPrincipal("ST2TEST");
    const metadataHash = Buffer.from("a".repeat(32));
    const result = contract.createTender(
      "Road Project",
      "Build new road",
      200,
      "Licensed contractors",
      1000000,
      "infrastructure",
      metadataHash
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const tender = contract.getTender(0);
    expect(tender?.title).toBe("Road Project");
    expect(tender?.description).toBe("Build new road");
    expect(tender?.deadline).toBe(200);
    expect(tender?.eligibility).toBe("Licensed contractors");
    expect(tender?.budget).toBe(1000000);
    expect(tender?.category).toBe("infrastructure");
    expect(tender?.status).toBe("open");
    expect(tender?.metadataHash).toEqual(metadataHash);
    expect(contract.stxTransfers).toEqual([
      { amount: 500, from: "ST1TEST", to: "ST2TEST" },
    ]);
  });

  it("rejects tender creation with duplicate title", () => {
    contract.setAuthorityPrincipal("ST2TEST");
    contract.createTender(
      "Duplicate",
      "Test desc",
      200,
      "Elig",
      1000,
      "infrastructure",
      Buffer.from("a".repeat(32))
    );
    const result = contract.createTender(
      "Duplicate",
      "Another desc",
      300,
      "Elig2",
      2000,
      "services",
      Buffer.from("b".repeat(32))
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_TENDER_ALREADY_EXISTS);
  });

  it("rejects tender creation with invalid title length", () => {
    contract.setAuthorityPrincipal("ST2TEST");
    const result = contract.createTender(
      "a".repeat(101),
      "Desc",
      200,
      "Elig",
      1000,
      "infrastructure",
      Buffer.from("a".repeat(32))
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_TITLE);
  });

  it("rejects tender creation with empty description", () => {
    contract.setAuthorityPrincipal("ST2TEST");
    const result = contract.createTender(
      "Title",
      "",
      200,
      "Elig",
      1000,
      "infrastructure",
      Buffer.from("a".repeat(32))
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_DESCRIPTION);
  });

  it("rejects tender creation with past deadline", () => {
    contract.setAuthorityPrincipal("ST2TEST");
    contract.blockHeight = 100;
    const result = contract.createTender(
      "Title",
      "Desc",
      50,
      "Elig",
      1000,
      "infrastructure",
      Buffer.from("a".repeat(32))
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_DEADLINE);
  });

  it("rejects tender creation with invalid eligibility length", () => {
    contract.setAuthorityPrincipal("ST2TEST");
    const result = contract.createTender(
      "Title",
      "Desc",
      200,
      "a".repeat(201),
      1000,
      "infrastructure",
      Buffer.from("a".repeat(32))
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_ELIGIBILITY);
  });

  it("rejects tender creation with zero budget", () => {
    contract.setAuthorityPrincipal("ST2TEST");
    const result = contract.createTender(
      "Title",
      "Desc",
      200,
      "Elig",
      0,
      "infrastructure",
      Buffer.from("a".repeat(32))
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_BUDGET);
  });

  it("rejects tender creation with invalid category", () => {
    contract.setAuthorityPrincipal("ST2TEST");
    const result = contract.createTender(
      "Title",
      "Desc",
      200,
      "Elig",
      1000,
      "invalid",
      Buffer.from("a".repeat(32))
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_CATEGORY);
  });

  it("rejects tender creation with invalid metadata hash", () => {
    contract.setAuthorityPrincipal("ST2TEST");
    const result = contract.createTender(
      "Title",
      "Desc",
      200,
      "Elig",
      1000,
      "infrastructure",
      Buffer.from("")
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_METADATA_HASH);
  });

  it("rejects tender creation when max tenders exceeded", () => {
    contract.setAuthorityPrincipal("ST2TEST");
    contract.state.maxTenders = 1;
    contract.createTender(
      "First",
      "Desc",
      200,
      "Elig",
      1000,
      "infrastructure",
      Buffer.from("a".repeat(32))
    );
    const result = contract.createTender(
      "Second",
      "Desc2",
      300,
      "Elig2",
      2000,
      "services",
      Buffer.from("b".repeat(32))
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_TENDERS_EXCEEDED);
  });

  it("updates tender successfully", () => {
    contract.setAuthorityPrincipal("ST2TEST");
    contract.createTender(
      "Old Title",
      "Old Desc",
      200,
      "Elig",
      1000,
      "infrastructure",
      Buffer.from("a".repeat(32))
    );
    const result = contract.updateTender(0, "New Title", "New Desc", 300);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const tender = contract.getTender(0);
    expect(tender?.title).toBe("New Title");
    expect(tender?.description).toBe("New Desc");
    expect(tender?.deadline).toBe(300);
    const update = contract.state.tenderUpdates.get(0);
    expect(update?.updatedTitle).toBe("New Title");
    expect(update?.updatedBy).toBe("ST1TEST");
  });

  it("rejects update for non-existent tender", () => {
    const result = contract.updateTender(99, "New", "Desc", 300);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_TENDER_NOT_FOUND);
  });

  it("rejects update by non-creator", () => {
    contract.setAuthorityPrincipal("ST2TEST");
    contract.createTender(
      "Title",
      "Desc",
      200,
      "Elig",
      1000,
      "infrastructure",
      Buffer.from("a".repeat(32))
    );
    contract.caller = "ST3FAKE";
    const result = contract.updateTender(0, "New", "Desc", 300);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("closes tender successfully", () => {
    contract.setAuthorityPrincipal("ST2TEST");
    contract.createTender(
      "Title",
      "Desc",
      200,
      "Elig",
      1000,
      "infrastructure",
      Buffer.from("a".repeat(32))
    );
    const result = contract.closeTender(0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const tender = contract.getTender(0);
    expect(tender?.status).toBe("closed");
  });

  it("rejects closing non-existent tender", () => {
    const result = contract.closeTender(99);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_TENDER_NOT_FOUND);
  });

  it("rejects closing by non-creator", () => {
    contract.setAuthorityPrincipal("ST2TEST");
    contract.createTender(
      "Title",
      "Desc",
      200,
      "Elig",
      1000,
      "infrastructure",
      Buffer.from("a".repeat(32))
    );
    contract.caller = "ST3FAKE";
    const result = contract.closeTender(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("rejects closing already closed tender", () => {
    contract.setAuthorityPrincipal("ST2TEST");
    contract.createTender(
      "Title",
      "Desc",
      200,
      "Elig",
      1000,
      "infrastructure",
      Buffer.from("a".repeat(32))
    );
    contract.closeTender(0);
    const result = contract.closeTender(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_STATUS);
  });

  it("sets registration fee successfully", () => {
    contract.setAuthorityPrincipal("ST2TEST");
    const result = contract.setRegistrationFee(1000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.registrationFee).toBe(1000);
  });

  it("returns correct tender count", () => {
    contract.setAuthorityPrincipal("ST2TEST");
    contract.createTender(
      "Tender1",
      "Desc1",
      200,
      "Elig1",
      1000,
      "infrastructure",
      Buffer.from("a".repeat(32))
    );
    contract.createTender(
      "Tender2",
      "Desc2",
      300,
      "Elig2",
      2000,
      "services",
      Buffer.from("b".repeat(32))
    );
    const result = contract.getTenderCount();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });
});
