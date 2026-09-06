import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { db } from './lib/db/client.js';
import { getInventoryKpis } from './lib/analytics/queries/inventory.js';
import { listStockView } from './lib/db/queries/inventory.js';
import { listWrrDocuments, listRecentWrrDocuments } from './lib/db/queries/receiving.js';
import { listPickLists, listRecentPickLists } from './lib/db/queries/withdrawals.js';
import { listInspectionCases } from './lib/db/queries/transfers.js';
import { listPendingApprovalRequests } from './lib/db/queries/approvals.js';
import { getPickListQtyAndCbmTrend, getDispatchRate, getPickListCountByFlow } from './lib/analytics/queries/outbound.js';
import {
  getDashboardKpis,
  getDashboardMonthlyFlow,
  getDashboardLocationOccupancy,
  getDashboardDeliveryPerformance,
  getDashboardHeatmapData,
  getDashboardMasterInventory,
} from './lib/db/queries/dashboard.js';

async function testQuery(name, fn) {
  try {
    const start = Date.now();
    await fn();
    console.log(`[PASS] ${name} (${Date.now() - start}ms)`);
  } catch (err) {
    console.error(`[FAIL] ${name}:`, err);
  }
}

async function main() {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 6);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  console.log('--- Testing all 18 queries on Home page ---');
  await testQuery('getInventoryKpis', () => getInventoryKpis());
  await testQuery('listStockView', () => listStockView(db));
  await testQuery('listWrrDocuments', () => listWrrDocuments(db, { limit: 3, offset: 0, status: 'receiving_in_progress' }));
  await testQuery('listPickLists', () => listPickLists(db, { limit: 3, offset: 0, status: 'allocated' }));
  await testQuery('listInspectionCases', () => listInspectionCases(db, { status: 'open', limit: 3 }));
  await testQuery('listPendingApprovalRequests', () => listPendingApprovalRequests(db, { limit: 3, offset: 0 }));
  await testQuery('getPickListQtyAndCbmTrend (weekly)', () => getPickListQtyAndCbmTrend({ startDate: weekStart, endDate: now }, 'all', 'day'));
  await testQuery('getPickListQtyAndCbmTrend (monthly)', () => getPickListQtyAndCbmTrend({ startDate: monthStart, endDate: now }, 'all', 'day'));
  await testQuery('listRecentWrrDocuments', () => listRecentWrrDocuments(db, { limit: 5 }));
  await testQuery('listRecentPickLists', () => listRecentPickLists(db, { limit: 5 }));
  await testQuery('getDispatchRate', () => getDispatchRate({ startDate: weekStart, endDate: now }));
  await testQuery('getPickListCountByFlow', () => getPickListCountByFlow({ startDate: weekStart, endDate: now }));
  await testQuery('getDashboardKpis', () => getDashboardKpis());
  await testQuery('getDashboardMonthlyFlow', () => getDashboardMonthlyFlow());
  await testQuery('getDashboardLocationOccupancy', () => getDashboardLocationOccupancy());
  await testQuery('getDashboardDeliveryPerformance', () => getDashboardDeliveryPerformance());
  await testQuery('getDashboardHeatmapData', () => getDashboardHeatmapData());
  await testQuery('getDashboardMasterInventory', () => getDashboardMasterInventory({ limit: 100 }));
}

main().then(() => process.exit(0));
