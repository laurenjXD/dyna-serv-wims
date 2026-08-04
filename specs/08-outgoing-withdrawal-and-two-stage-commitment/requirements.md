# 08 - Outgoing Withdrawal & Two-Stage Commitment — Requirements
Status: Draft
Depends on: specs/01-core-data-model/

## 1. Overview
This module governs the process of withdrawing inventory via Pick Lists, committing stock prior to physical dispatch, and generating the Outgoing Ledger audit trail.

## 2. User Stories

### Outgoing Ledger Audit Trail
- **WHEN** a user visits the Outgoing/Withdrawal page, **THE SYSTEM SHALL** provide an Outgoing Ledger tab/view that queries `inventory_transactions` where `movement_type` is `pick` or `transfer`, **SO THAT** staff can view a complete chronological audit trail of all items dispatched, including the date, time, Pick List reference, Customer/Requestor, dispatching user, item code, lot number, and quantity withdrawn.
