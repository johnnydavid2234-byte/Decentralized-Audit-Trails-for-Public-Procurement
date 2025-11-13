(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-TENDER-ID u101)
(define-constant ERR-INVALID-BID-ID u102)
(define-constant ERR-INVALID-TIMESTAMP u103)
(define-constant ERR-NO-TENDER-DATA u104)
(define-constant ERR-NO-BID-DATA u105)
(define-constant ERR-INVALID-HASH u106)
(define-constant ERR-INVALID-STATUS u107)
(define-constant ERR-NO-EVALUATION-DATA u108)
(define-constant ERR-NO-AWARD-DATA u109)
(define-constant ERR-INVALID-PRINCIPAL u110)
(define-constant ERR-DUPLICATE-QUERY u111)
(define-constant ERR-INVALID-METADATA u112)
(define-constant ERR-INVALID-VERIFICATION u113)
(define-constant ERR-INVALID-REQUEST-ID u114)

(define-data-var request-counter uint u0)
(define-data-var authority-principal (optional principal) none)
(define-data-var max-queries uint u1000)

(define-map tender-audit-trails
  uint
  {
    tender-id: uint,
    title: (string-utf8 100),
    description: (string-utf8 500),
    creator: principal,
    timestamp: uint,
    status: (string-utf8 20),
    metadata-hash: (buff 32)
  }
)

(define-map bid-audit-trails
  { tender-id: uint, bid-id: uint }
  {
    bidder: principal,
    bid-hash: (buff 32),
    submission-time: uint,
    reveal-time: uint,
    score: uint,
    metadata: (string-utf8 200)
  }
)

(define-map evaluation-audit-trails
  uint
  {
    tender-id: uint,
    evaluator: principal,
    score-hash: (buff 32),
    evaluation-time: uint
  }
)

(define-map award-audit-trails
  uint
  {
    tender-id: uint,
    winner: principal,
    award-time: uint,
    justification: (string-utf8 500)
  }
)

(define-map verification-requests
  uint
  {
    requester: principal,
    tender-id: uint,
    bid-id: (optional uint),
    request-time: uint,
    verified: bool
  }
)

(define-read-only (get-tender-audit (tender-id uint))
  (map-get? tender-audit-trails tender-id)
)

(define-read-only (get-bid-audit (tender-id uint) (bid-id uint))
  (map-get? bid-audit-trails { tender-id: tender-id, bid-id: bid-id })
)

(define-read-only (get-evaluation-audit (tender-id uint))
  (map-get? evaluation-audit-trails tender-id)
)

(define-read-only (get-award-audit (tender-id uint))
  (map-get? award-audit-trails tender-id)
)

(define-read-only (get-verification-request (request-id uint))
  (map-get? verification-requests request-id)
)

(define-read-only (get-request-count)
  (ok (var-get request-counter))
)

(define-private (validate-principal (p principal))
  (if (not (is-eq p 'SP000000000000000000002Q6VF78))
      (ok true)
      (err ERR-INVALID-PRINCIPAL))
)

(define-private (validate-tender-id (tender-id uint))
  (if (> tender-id u0)
      (ok true)
      (err ERR-INVALID-TENDER-ID))
)

(define-private (validate-bid-id (bid-id uint))
  (if (> bid-id u0)
      (ok true)
      (err ERR-INVALID-BID-ID))
)

(define-private (validate-timestamp (ts uint))
  (if (>= ts block-height)
      (ok true)
      (err ERR-INVALID-TIMESTAMP))
)

(define-private (validate-hash (hash (buff 32)))
  (if (> (len hash) u0)
      (ok true)
      (err ERR-INVALID-HASH))
)

(define-private (validate-status (status (string-utf8 20)))
  (if (or (is-eq status "open") (is-eq status "closed") (is-eq status "awarded"))
      (ok true)
      (err ERR-INVALID-STATUS))
)

(define-public (set-authority-principal (principal principal))
  (begin
    (try! (validate-principal principal))
    (asserts! (is-none (var-get authority-principal)) (err ERR-NOT-AUTHORIZED))
    (var-set authority-principal (some principal))
    (ok true)
  )
)

(define-public (request-tender-verification (tender-id uint))
  (let (
      (request-id (var-get request-counter))
      (current-max (var-get max-queries))
    )
    (asserts! (< request-id current-max) (err ERR-DUPLICATE-QUERY))
    (try! (validate-tender-id tender-id))
    (asserts! (is-some (map-get? tender-audit-trails tender-id)) (err ERR-NO-TENDER-DATA))
    (map-set verification-requests request-id
      {
        requester: tx-sender,
        tender-id: tender-id,
        bid-id: none,
        request-time: block-height,
        verified: false
      }
    )
    (var-set request-counter (+ request-id u1))
    (print { event: "verification-requested", request-id: request-id })
    (ok request-id)
  )
)

(define-public (request-bid-verification (tender-id uint) (bid-id uint))
  (let (
      (request-id (var-get request-counter))
      (current-max (var-get max-queries))
    )
    (asserts! (< request-id current-max) (err ERR-DUPLICATE-QUERY))
    (try! (validate-tender-id tender-id))
    (try! (validate-bid-id bid-id))
    (asserts! (is-some (map-get? bid-audit-trails { tender-id: tender-id, bid-id: bid-id })) (err ERR-NO-BID-DATA))
    (map-set verification-requests request-id
      {
        requester: tx-sender,
        tender-id: tender-id,
        bid-id: (some bid-id),
        request-time: block-height,
        verified: false
      }
    )
    (var-set request-counter (+ request-id u1))
    (print { event: "bid-verification-requested", request-id: request-id })
    (ok request-id)
  )
)

(define-public (verify-request (request-id uint))
  (let (
      (request (map-get? verification-requests request-id))
    )
    (match request
      req
        (begin
          (asserts! (is-some (var-get authority-principal)) (err ERR-NOT-AUTHORIZED))
          (asserts! (not (get verified req)) (err ERR-INVALID-VERIFICATION))
          (map-set verification-requests request-id
            (merge req { verified: true })
          )
          (print { event: "request-verified", request-id: request-id })
          (ok true)
        )
      (err ERR-INVALID-REQUEST-ID)
    )
  )
)