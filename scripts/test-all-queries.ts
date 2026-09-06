import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { db } from '../lib/db/client';
import { getInventoryKpis } from '../lib/analytics/queries/inventory';
import { listStockView } from '../lib/db/queries/inventory';
import { listWrrDocuments, listRecentWrrDocuments } from '../lib/db/queries/receiving';
import { listPickLists, listRecentPickLists } from '../lib/db/queries/withdrawals';
import { listInspectionCases } from '../lib/db/queries/transfers';
import { listPendingApprovalRequests } from '../lib/db/queries/approvals';
import { getPickListQtyAndCbmTrend, getDispatchRate, getPickListCountByFlow } from '../lib/analytics/queries/outbound';
import {
  getDashboardKpis,
  getDashboardMonthlyFlow,
  getDashboardLocationOccupancy,
  getDashboardDeliveryPerformance,
  getDashboardHeatmapData,
  getDashboardMasterInventory,
} from '../lib/db/queries/dashboard';

async function testQuery(name: string, fn: () => Promise<any>) {
  try {
    const start = Date.now();
    await fn();
    console.log(`[PASS] ${name} (${Date.now() - start}ms)`);
  } catch (err: any) {
    console.error(`[FAIL] ${name}:`, err.message || err);
  }
}

async function main() {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 6);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  console.log('--- Testing all 18 queries on Home page against Live Database ---');
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
