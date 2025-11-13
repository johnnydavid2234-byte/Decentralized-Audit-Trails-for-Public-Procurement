(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-TENDER-ID u101)
(define-constant ERR-INVALID-TITLE u102)
(define-constant ERR-INVALID-DESCRIPTION u103)
(define-constant ERR-INVALID-DEADLINE u104)
(define-constant ERR-INVALID-ELIGIBILITY u105)
(define-constant ERR-TENDER-ALREADY-EXISTS u106)
(define-constant ERR-TENDER-NOT-FOUND u107)
(define-constant ERR-INVALID-BUDGET u108)
(define-constant ERR-INVALID-CATEGORY u109)
(define-constant ERR-INVALID-STATUS u110)
(define-constant ERR-MAX-TENDERS-EXCEEDED u111)
(define-constant ERR-INVALID-METADATA-HASH u112)
(define-constant ERR-INVALID-CREATOR u113)
(define-constant ERR-INVALID-UPDATE u114)

(define-data-var next-tender-id uint u0)
(define-data-var max-tenders uint u500)
(define-data-var authority-principal (optional principal) none)
(define-data-var registration-fee uint u500)

(define-map tenders
  uint
  {
    id: uint,
    title: (string-utf8 100),
    description: (string-utf8 500),
    creator: principal,
    deadline: uint,
    eligibility: (string-utf8 200),
    budget: uint,
    category: (string-utf8 50),
    status: (string-utf8 20),
    created-at: uint,
    metadata-hash: (buff 32)
  }
)

(define-map tenders-by-title
  (string-utf8 100)
  uint
)

(define-map tender-updates
  uint
  {
    updated-title: (string-utf8 100),
    updated-description: (string-utf8 500),
    updated-deadline: uint,
    updated-by: principal,
    updated-at: uint
  }
)

(define-read-only (get-tender (tender-id uint))
  (map-get? tenders tender-id)
)

(define-read-only (get-tender-updates (tender-id uint))
  (map-get? tender-updates tender-id)
)

(define-read-only (is-tender-registered (title (string-utf8 100)))
  (is-some (map-get? tenders-by-title title))
)

(define-read-only (get-tender-count)
  (ok (var-get next-tender-id))
)

(define-private (validate-title (title (string-utf8 100)))
  (if (and (> (len title) u0) (<= (len title) u100))
      (ok true)
      (err ERR-INVALID-TITLE))
)

(define-private (validate-description (desc (string-utf8 500)))
  (if (and (> (len desc) u0) (<= (len desc) u500))
      (ok true)
      (err ERR-INVALID-DESCRIPTION))
)

(define-private (validate-deadline (deadline uint))
  (if (> deadline block-height)
      (ok true)
      (err ERR-INVALID-DEADLINE))
)

(define-private (validate-eligibility (elig (string-utf8 200)))
  (if (and (> (len elig) u0) (<= (len elig) u200))
      (ok true)
      (err ERR-INVALID-ELIGIBILITY))
)

(define-private (validate-budget (budget uint))
  (if (> budget u0)
      (ok true)
      (err ERR-INVALID-BUDGET))
)

(define-private (validate-category (cat (string-utf8 50)))
  (if (or (is-eq cat "infrastructure") (is-eq cat "services") (is-eq cat "goods"))
      (ok true)
      (err ERR-INVALID-CATEGORY))
)

(define-private (validate-status (status (string-utf8 20)))
  (if (or (is-eq status "open") (is-eq status "closed") (is-eq status "awarded"))
      (ok true)
      (err ERR-INVALID-STATUS))
)

(define-private (validate-metadata-hash (hash (buff 32)))
  (if (> (len hash) u0)
      (ok true)
      (err ERR-INVALID-METADATA-HASH))
)

(define-private (validate-principal (p principal))
  (if (not (is-eq p 'SP000000000000000000002Q6VF78))
      (ok true)
      (err ERR-INVALID-CREATOR))
)

(define-public (set-authority-principal (principal principal))
  (begin
    (try! (validate-principal principal))
    (asserts! (is-none (var-get authority-principal)) (err ERR-NOT-AUTHORIZED))
    (var-set authority-principal (some principal))
    (ok true)
  )
)

(define-public (set-max-tenders (new-max uint))
  (begin
    (asserts! (> new-max u0) (err ERR-MAX-TENDERS-EXCEEDED))
    (asserts! (is-some (var-get authority-principal)) (err ERR-NOT-AUTHORIZED))
    (var-set max-tenders new-max)
    (ok true)
  )
)

(define-public (set-registration-fee (new-fee uint))
  (begin
    (asserts! (>= new-fee u0) (err ERR-INVALID-BUDGET))
    (asserts! (is-some (var-get authority-principal)) (err ERR-NOT-AUTHORIZED))
    (var-set registration-fee new-fee)
    (ok true)
  )
)

(define-public (create-tender
  (title (string-utf8 100))
  (description (string-utf8 500))
  (deadline uint)
  (eligibility (string-utf8 200))
  (budget uint)
  (category (string-utf8 50))
  (metadata-hash (buff 32))
)
  (let (
      (next-id (var-get next-tender-id))
      (current-max (var-get max-tenders))
      (authority (var-get authority-principal))
    )
    (asserts! (< next-id current-max) (err ERR-MAX-TENDERS-EXCEEDED))
    (try! (validate-title title))
    (try! (validate-description description))
    (try! (validate-deadline deadline))
    (try! (validate-eligibility eligibility))
    (try! (validate-budget budget))
    (try! (validate-category category))
    (try! (validate-metadata-hash metadata-hash))
    (asserts! (is-none (map-get? tenders-by-title title)) (err ERR-TENDER-ALREADY-EXISTS))
    (if (is-some authority)
        (let ((auth-unwrap (unwrap! authority (err ERR-NOT-AUTHORIZED))))
          (try! (stx-transfer? (var-get registration-fee) tx-sender auth-unwrap))
        )
        true
    )
    (map-set tenders next-id
      {
        id: next-id,
        title: title,
        description: description,
        creator: tx-sender,
        deadline: deadline,
        eligibility: eligibility,
        budget: budget,
        category: category,
        status: "open",
        created-at: block-height,
        metadata-hash: metadata-hash
      }
    )
    (map-set tenders-by-title title next-id)
    (var-set next-tender-id (+ next-id u1))
    (print { event: "tender-created", id: next-id })
    (ok next-id)
  )
)

(define-public (update-tender
  (tender-id uint)
  (new-title (string-utf8 100))
  (new-description (string-utf8 500))
  (new-deadline uint)
)
  (let ((tender (map-get? tenders tender-id)))
    (match tender
      t
        (begin
          (asserts! (is-eq (get creator t) tx-sender) (err ERR-NOT-AUTHORIZED))
          (try! (validate-title new-title))
          (try! (validate-description new-description))
          (try! (validate-deadline new-deadline))
          (let ((existing-title (map-get? tenders-by-title new-title)))
            (match existing-title
              existing-id
                (asserts! (is-eq existing-id tender-id) (err ERR-TENDER-ALREADY-EXISTS))
              true
            )
          )
          (if (not (is-eq (get title t) new-title))
              (begin
                (map-delete tenders-by-title (get title t))
                (map-set tenders-by-title new-title tender-id)
              )
              true
          )
          (map-set tenders tender-id
            {
              id: (get id t),
              title: new-title,
              description: new-description,
              creator: (get creator t),
              deadline: new-deadline,
              eligibility: (get eligibility t),
              budget: (get budget t),
              category: (get category t),
              status: (get status t),
              created-at: (get created-at t),
              metadata-hash: (get metadata-hash t)
            }
          )
          (map-set tender-updates tender-id
            {
              updated-title: new-title,
              updated-description: new-description,
              updated-deadline: new-deadline,
              updated-by: tx-sender,
              updated-at: block-height
            }
          )
          (print { event: "tender-updated", id: tender-id })
          (ok true)
        )
      (err ERR-TENDER-NOT-FOUND)
    )
  )
)

(define-public (close-tender (tender-id uint))
  (let ((tender (map-get? tenders tender-id)))
    (match tender
      t
        (begin
          (asserts! (is-eq (get creator t) tx-sender) (err ERR-NOT-AUTHORIZED))
          (asserts! (is-eq (get status t) "open") (err ERR-INVALID-STATUS))
          (map-set tenders tender-id
            (merge t { status: "closed" })
          )
          (print { event: "tender-closed", id: tender-id })
          (ok true)
        )
      (err ERR-TENDER-NOT-FOUND)
    )
  )
)