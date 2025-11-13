(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-BIDDER-ID u101)
(define-constant ERR-INVALID-QUALIFICATION-HASH u102)
(define-constant ERR-INVALID-PROOF-HASH u103)
(define-constant ERR-INVALID-TENDER-ID u104)
(define-constant ERR-BIDDER-ALREADY-REGISTERED u105)
(define-constant ERR-BIDDER-NOT-FOUND u106)
(define-constant ERR-INVALID-FINANCIAL-PROOF u107)
(define-constant ERR-INVALID-LICENSE u108)
(define-constant ERR-QUALIFICATION-NOT-MET u109)
(define-constant ERR-MAX-BIDDERS-EXCEEDED u110)
(define-constant ERR-INVALID-CRITERIA u111)
(define-constant ERR-INVALID-DOC-HASH u112)
(define-constant ERR-INVALID-EXPERIENCE u113)
(define-constant ERR-INVALID-STATUS u114)
(define-constant ERR-INVALID-UPDATE u115)

(define-data-var next-bidder-id uint u0)
(define-data-var max-bidders uint u1000)
(define-data-var authority-principal (optional principal) none)
(define-data-var qualification-fee uint u200)

(define-map bidders
  uint
  {
    id: uint,
    principal: principal,
    qualification-hash: (buff 32),
    proof-hash: (buff 32),
    financial-proof: uint,
    license-hash: (buff 32),
    experience-years: uint,
    status: (string-utf8 20),
    registered-at: uint
  }
)

(define-map bidder-qualifications
  { bidder-id: uint, tender-id: uint }
  {
    qualified: bool,
    criteria-met: (string-utf8 100),
    qualified-at: uint
  }
)

(define-map qualification-criteria
  uint
  {
    tender-id: uint,
    min-financial: uint,
    required-license: (string-utf8 50),
    min-experience: uint,
    doc-hash: (buff 32),
    set-by: principal,
    set-at: uint
  }
)

(define-map bidders-by-principal
  principal
  uint
)

(define-read-only (get-bidder (bidder-id uint))
  (map-get? bidders bidder-id)
)

(define-read-only (get-bidder-qualification (bidder-id uint) (tender-id uint))
  (map-get? bidder-qualifications { bidder-id: bidder-id, tender-id: tender-id })
)

(define-read-only (get-qualification-criteria (tender-id uint))
  (map-get? qualification-criteria tender-id)
)

(define-read-only (is-bidder-registered (principal principal))
  (is-some (map-get? bidders-by-principal principal))
)

(define-read-only (get-bidder-count)
  (ok (var-get next-bidder-id))
)

(define-private (validate-qualification-hash (hash (buff 32)))
  (if (> (len hash) u0)
      (ok true)
      (err ERR-INVALID-QUALIFICATION-HASH))
)

(define-private (validate-proof-hash (hash (buff 32)))
  (if (> (len hash) u0)
      (ok true)
      (err ERR-INVALID-PROOF-HASH))
)

(define-private (validate-financial-proof (proof uint))
  (if (> proof u0)
      (ok true)
      (err ERR-INVALID-FINANCIAL-PROOF))
)

(define-private (validate-license (license (buff 32)))
  (if (> (len license) u0)
      (ok true)
      (err ERR-INVALID-LICENSE))
)

(define-private (validate-experience (years uint))
  (if (>= years u0)
      (ok true)
      (err ERR-INVALID-EXPERIENCE))
)

(define-private (validate-status (status (string-utf8 20)))
  (if (or (is-eq status "qualified") (is-eq status "pending") (is-eq status "rejected"))
      (ok true)
      (err ERR-INVALID-STATUS))
)

(define-private (validate-doc-hash (hash (buff 32)))
  (if (> (len hash) u0)
      (ok true)
      (err ERR-INVALID-DOC-HASH))
)

(define-private (validate-criteria (criteria (string-utf8 100)))
  (if (and (> (len criteria) u0) (<= (len criteria) u100))
      (ok true)
      (err ERR-INVALID-CRITERIA))
)

(define-private (validate-principal (p principal))
  (if (not (is-eq p 'SP000000000000000000002Q6VF78))
      (ok true)
      (err ERR-NOT-AUTHORIZED))
)

(define-public (set-authority-principal (principal principal))
  (begin
    (try! (validate-principal principal))
    (asserts! (is-none (var-get authority-principal)) (err ERR-NOT-AUTHORIZED))
    (var-set authority-principal (some principal))
    (ok true)
  )
)

(define-public (set-max-bidders (new-max uint))
  (begin
    (asserts! (> new-max u0) (err ERR-MAX-BIDDERS-EXCEEDED))
    (asserts! (is-some (var-get authority-principal)) (err ERR-NOT-AUTHORIZED))
    (var-set max-bidders new-max)
    (ok true)
  )
)

(define-public (set-qualification-fee (new-fee uint))
  (begin
    (asserts! (>= new-fee u0) (err ERR-INVALID-FINANCIAL-PROOF))
    (asserts! (is-some (var-get authority-principal)) (err ERR-NOT-AUTHORIZED))
    (var-set qualification-fee new-fee)
    (ok true)
  )
)

(define-public (register-bidder
  (qualification-hash (buff 32))
  (proof-hash (buff 32))
  (financial-proof uint)
  (license-hash (buff 32))
  (experience-years uint)
)
  (let (
      (next-id (var-get next-bidder-id))
      (current-max (var-get max-bidders))
      (authority (var-get authority-principal))
    )
    (asserts! (< next-id current-max) (err ERR-MAX-BIDDERS-EXCEEDED))
    (try! (validate-qualification-hash qualification-hash))
    (try! (validate-proof-hash proof-hash))
    (try! (validate-financial-proof financial-proof))
    (try! (validate-license license-hash))
    (try! (validate-experience experience-years))
    (asserts! (is-none (map-get? bidders-by-principal tx-sender)) (err ERR-BIDDER-ALREADY-REGISTERED))
    (if (is-some authority)
        (let ((auth-unwrap (unwrap! authority (err ERR-NOT-AUTHORIZED))))
          (try! (stx-transfer? (var-get qualification-fee) tx-sender auth-unwrap))
        )
        true
    )
    (map-set bidders next-id
      {
        id: next-id,
        principal: tx-sender,
        qualification-hash: qualification-hash,
        proof-hash: proof-hash,
        financial-proof: financial-proof,
        license-hash: license-hash,
        experience-years: experience-years,
        status: "pending",
        registered-at: block-height
      }
    )
    (map-set bidders-by-principal tx-sender next-id)
    (var-set next-bidder-id (+ next-id u1))
    (print { event: "bidder-registered", id: next-id })
    (ok next-id)
  )
)

(define-public (set-qualification-criteria
  (tender-id uint)
  (min-financial uint)
  (required-license (string-utf8 50))
  (min-experience uint)
  (doc-hash (buff 32))
)
  (begin
    (asserts! (is-some (var-get authority-principal)) (err ERR-NOT-AUTHORIZED))
    (try! (validate-financial-proof min-financial))
    (try! (validate-experience min-experience))
    (try! (validate-doc-hash doc-hash))
    (map-set qualification-criteria tender-id
      {
        tender-id: tender-id,
        min-financial: min-financial,
        required-license: required-license,
        min-experience: min-experience,
        doc-hash: doc-hash,
        set-by: tx-sender,
        set-at: block-height
      }
    )
    (print { event: "criteria-set", tender-id: tender-id })
    (ok true)
  )
)

(define-public (qualify-bidder-for-tender (bidder-id uint) (tender-id uint))
  (let (
      (bidder (map-get? bidders bidder-id))
      (criteria (map-get? qualification-criteria tender-id))
    )
    (match bidder
      b
        (match criteria
          c
            (begin
              (asserts! (is-eq (get principal b) tx-sender) (err ERR-NOT-AUTHORIZED))
              (asserts! (is-eq (get status b) "pending") (err ERR-INVALID-STATUS))
              (let (
                  (meets-financial (>= (get financial-proof b) (get min-financial c)))
                  (meets-experience (>= (get experience-years b) (get min-experience c)))
                  (meets-license (is-eq (get license-hash b) (get doc-hash c)))
                  (qualified (and meets-financial meets-experience meets-license))
                  (criteria-met (if qualified "all-criteria-met" "partial-match"))
                )
                (map-set bidders bidder-id
                  (merge b { status: (if qualified "qualified" "rejected") })
                )
                (map-set bidder-qualifications { bidder-id: bidder-id, tender-id: tender-id }
                  {
                    qualified: qualified,
                    criteria-met: criteria-met,
                    qualified-at: block-height
                  }
                )
                (print { event: "bidder-qualified", bidder-id: bidder-id, tender-id: tender-id, qualified: qualified })
                (ok qualified)
              )
            )
          (err ERR-INVALID-CRITERIA)
        )
      (err ERR-BIDDER-NOT-FOUND)
    )
  )
)

(define-public (update-bidder-status (bidder-id uint) (new-status (string-utf8 20)))
  (let ((bidder (map-get? bidders bidder-id)))
    (match bidder
      b
        (begin
          (asserts! (is-some (var-get authority-principal)) (err ERR-NOT-AUTHORIZED))
          (try! (validate-status new-status))
          (map-set bidders bidder-id
            (merge b { status: new-status })
          )
          (print { event: "status-updated", bidder-id: bidder-id })
          (ok true)
        )
      (err ERR-BIDDER-NOT-FOUND)
    )
  )
)