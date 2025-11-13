# 📊 Decentralized Audit Trails for Public Procurement

Welcome to a transparent revolution in public procurement! This Web3 project leverages the Stacks blockchain and Clarity smart contracts to create immutable audit trails for government tenders, preventing bid rigging, corruption, and manipulation by ensuring all steps—from tender announcement to contract award—are logged on-chain for public verification.

## ✨ Features
🔒 Immutable logging of all procurement actions to detect collusion  
📜 Transparent tender announcements and bid submissions  
🛡️ Encrypted bids to prevent premature leaks  
✅ Automated evaluation and winner selection with verifiable criteria  
🚨 Dispute resolution mechanism with on-chain evidence  
👥 Public verification tools for auditors and citizens  
💰 Escrow for secure payments tied to milestones  
🛑 Prevention of duplicate or rigged bids through unique hashes  

## 🛠 How It Works
This project uses 8 Clarity smart contracts to orchestrate the procurement process, ensuring decentralization and auditability. Each contract handles a specific phase, interacting via traits for modularity.

### Smart Contracts Overview
1. **TenderRegistry.clar**: Registers new tenders by government entities, storing details like description, deadlines, and eligibility criteria. Emits events for announcements.  
2. **BidderQualifier.clar**: Verifies and registers bidders based on predefined qualifications (e.g., licenses, financial proofs hashed on-chain). Prevents unqualified participants.  
3. **BidSubmission.clar**: Allows qualified bidders to submit encrypted bids (using off-chain encryption, hashed on-chain). Timestamps submissions to enforce deadlines.  
4. **BidReveal.clar**: Handles bid decryption and revelation after the submission deadline, logging all reveals immutably to spot irregularities.  
5. **EvaluationEngine.clar**: Automates bid scoring using predefined algorithms (e.g., lowest price or quality-weighted). Stores evaluation logs for audits.  
6. **AwardManager.clar**: Awards the contract to the winner based on evaluation, triggers escrow setup, and logs the decision with justifications.  
7. **PaymentEscrow.clar**: Manages milestone-based payments in STX or tokens, releasing funds only upon verified completion proofs.  
8. **AuditVerifier.clar**: Provides read-only functions for querying the entire audit trail, verifying ownership of actions, and detecting anomalies like bid patterns.  

**For Government Officials (Tender Issuers)**  
- Announce a tender via `TenderRegistry` with details and deadlines.  
- Qualify bidders through `BidderQualifier`.  
- After deadlines, trigger `BidReveal` and let `EvaluationEngine` score bids.  
- Use `AwardManager` to finalize the winner—all actions are auto-logged for transparency.  

**For Bidders**  
- Register and qualify via `BidderQualifier`.  
- Submit hashed/encrypted bids using `BidSubmission`.  
- Reveal your bid post-deadline with `BidReveal`.  
- If awarded, interact with `PaymentEscrow` for milestone payments.  

**For Auditors and the Public**  
- Query any tender's full history via `AuditVerifier` to check for bid rigging (e.g., unusual patterns in submissions).  
- Verify timestamps, hashes, and decisions instantly—everything is immutable on the blockchain!  

This setup solves real-world issues in public procurement by making the process tamper-proof, reducing corruption, and enabling global oversight. Deploy on Stacks for low-cost, Bitcoin-secured transactions. Start building by cloning the repo and deploying the contracts!