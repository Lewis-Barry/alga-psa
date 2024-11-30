import { describe, it, expect, vi, beforeEach, beforeAll, afterEach, afterAll } from 'vitest';
import { finalizeInvoice, generateInvoice } from '@/lib/actions/invoiceActions';
import { v4 as uuidv4 } from 'uuid';
import knex from 'knex';
import { parse, addDays, parseISO } from 'date-fns';
import { TextEncoder } from 'util';
import dotenv from 'dotenv';
import { ICompanyTaxSettings, ITaxRate, ICompanyTaxRate } from '@/interfaces/tax.interfaces';

global.TextEncoder = TextEncoder;

// Mock Headers implementation
const mockHeaders = {
  get: vi.fn((key: string) => key === 'x-tenant-id' ? '11111111-1111-1111-1111-111111111111' : null),
  append: vi.fn(),
  delete: vi.fn(),
  entries: vi.fn(),
  forEach: vi.fn(),
  has: vi.fn(),
  keys: vi.fn(),
  set: vi.fn(),
  values: vi.fn(),
};

vi.mock('next/headers', () => ({
  headers: vi.fn(() => mockHeaders)
}));

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(() => Promise.resolve({
    user: {
      id: 'mock-user-id',
      tenant: '11111111-1111-1111-1111-111111111111'
    },
  })),
}));

vi.mock("@/app/api/auth/[...nextauth]/options", () => ({
  options: {},
}));

// Test Utilities and Factories
interface TestContext {
  db: knex.Knex;
  tenantId: string;
  companyId: string;
}

class TestDataFactory {
  static async createTenant(db: knex.Knex): Promise<string> {
    const tenantId = '11111111-1111-1111-1111-111111111111';
    await db('tenants').insert({
      tenant: tenantId,
      company_name: 'Test Tenant',
      email: 'test@example.com',
      created_at: new Date(),
      updated_at: new Date()
    });
    return tenantId;
  }

  static async createCompany(db: knex.Knex, tenantId: string, name = 'Test Company'): Promise<string> {
    const companyId = uuidv4();
    await db('companies').insert({
      company_id: companyId,
      company_name: name,
      tenant: tenantId,
    });
    return companyId;
  }

  static async createBillingPlan(db: knex.Knex, tenantId: string, options: {
    name: string;
    type: 'Fixed' | 'Hourly' | 'Usage' | 'Bucket';
    frequency?: string;
  }): Promise<string> {
    const planId = uuidv4();
    await db('billing_plans').insert({
      plan_id: planId,
      plan_name: options.name,
      billing_frequency: options.frequency || 'monthly',
      is_custom: false,
      plan_type: options.type,
      tenant: tenantId,
    });
    return planId;
  }

  static async createService(db: knex.Knex, tenantId: string, options: {
    name: string;
    type: string;
    rate?: number;
    unit?: string;
  }): Promise<string> {
    const serviceId = uuidv4();
    await db('service_catalog').insert({
      tenant: tenantId,
      service_id: serviceId,
      service_name: options.name,
      description: `Test service: ${options.name}`,
      service_type: options.type,
      default_rate: options.rate,
      unit_of_measure: options.unit || 'unit',
    });
    return serviceId;
  }

  static async assignPlanToCompany(db: knex.Knex, tenantId: string, companyId: string, planId: string, startDate = '2023-01-01'): Promise<void> {
    await db('company_billing_plans').insert({
      company_billing_plan_id: uuidv4(),
      company_id: companyId,
      plan_id: planId,
      start_date: new Date(startDate),
      is_active: true,
      tenant: tenantId,
    });
  }

  static async createTaxRate(db: knex.Knex, tenantId: string, options: {
    percentage: number;
    region?: string;
  }): Promise<string> {
    const taxRateId = uuidv4();
    await db('tax_rates').insert({
      tax_rate_id: taxRateId,
      tax_type: 'VAT',
      country_code: 'US',
      tax_percentage: options.percentage,
      region: options.region,
      is_reverse_charge_applicable: false,
      is_composite: false,
      start_date: new Date('2023-01-01'),
      is_active: true,
      description: 'Test Tax Rate',
      tenant: tenantId,
    });
    return taxRateId;
  }
}

// Database setup
let db: knex.Knex;
let context: TestContext;

beforeAll(async () => {
  dotenv.config();
  
  if (process.env.DB_NAME_SERVER === 'server') {
    throw new Error('Please use a test database for testing.');
  }

  db = knex({
    client: 'pg',
    connection: {
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      user: process.env.DB_USER_ADMIN,
      password: process.env.DB_PASSWORD_SERVER,
      database: process.env.DB_NAME_SERVER
    }
  });
});

afterAll(async () => {
  await db.destroy();
});

beforeEach(async () => {
  // Clean and reset database before each test
  await db.raw('DROP SCHEMA public CASCADE');
  await db.raw('CREATE SCHEMA public');
  await db.raw(`SET app.environment = '${process.env.APP_ENV}'`);
  await db.migrate.latest();
  await db.seed.run();
  
  // Create fresh tenant and company for each test
  const tenantId = await TestDataFactory.createTenant(db);
  const companyId = await TestDataFactory.createCompany(db, tenantId);
  
  context = {
    db,
    tenantId,
    companyId
  };
  
  // Set up default tax settings for the company
  const taxRateId = await TestDataFactory.createTaxRate(db, context.tenantId, { percentage: 10 });
  const companyTaxSettings: ICompanyTaxSettings = {
    company_id: context.companyId,
    tax_rate_id: taxRateId,
    is_reverse_charge_applicable: false,
    tenant: tenantId
  };
  
  await db('company_tax_settings').insert(companyTaxSettings);
});

describe('Billing Invoice Generation', () => {
  describe('Fixed Price Plans', () => {
    it('should generate an invoice with line items for each service', async () => {
      // Arrange
      const planId = await TestDataFactory.createBillingPlan(db, context.tenantId, {
        name: 'Standard Fixed Plan',
        type: 'Fixed'
      });

      const service1Id = await TestDataFactory.createService(db, context.tenantId, {
        name: 'Service 1',
        type: 'Fixed',
        rate: 10000
      });

      const service2Id = await TestDataFactory.createService(db, context.tenantId, {
        name: 'Service 2',
        type: 'Fixed',
        rate: 15000
      });

      await db('plan_services').insert([
        { plan_id: planId, service_id: service1Id, quantity: 1, tenant: context.tenantId },
        { plan_id: planId, service_id: service2Id, quantity: 1, tenant: context.tenantId }
      ]);

      await TestDataFactory.assignPlanToCompany(db, context.tenantId, context.companyId, planId);

      // Act
      const result = await generateInvoice(context.companyId, '2023-01-01T00:00:00Z', '2023-02-01T00:00:00Z');

      // Assert
      expect(result).toMatchObject({
        company: { name: 'Test Company' },
        subtotal: 25000,
        status: 'draft'
      });

      const invoiceItems = await db('invoice_items')
        .where('invoice_id', result.invoice_id)
        .select('*');

      expect(invoiceItems).toHaveLength(2);
      expect(invoiceItems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            description: 'Service 1',
            quantity: 1,
            unit_price: 10000,
            net_amount: 10000
          }),
          expect.objectContaining({
            description: 'Service 2',
            quantity: 1,
            unit_price: 15000,
            net_amount: 15000
          })
        ])
      );
    });

    it('should calculate taxes correctly', async () => {
      // Arrange
      const planId = await TestDataFactory.createBillingPlan(db, context.tenantId, {
        name: 'Taxable Plan',
        type: 'Fixed'
      });

      const serviceId = await TestDataFactory.createService(db, context.tenantId, {
        name: 'Taxable Service',
        type: 'Fixed',
        rate: 50000
      });

      await db('plan_services').insert({
        plan_id: planId,
        service_id: serviceId,
        quantity: 1,
        tenant: context.tenantId
      });

      await TestDataFactory.assignPlanToCompany(db, context.tenantId, context.companyId, planId);

      const taxRateId = await TestDataFactory.createTaxRate(db, context.tenantId, { percentage: 10 });
      await db('company_tax_rates').insert({
        company_id: context.companyId,
        tax_rate_id: taxRateId,
        tenant: context.tenantId
      });

      // Act
      const result = await generateInvoice(context.companyId, '2023-01-01T00:00:00Z', '2023-02-01T00:00:00Z');

      // Assert
      expect(result).toMatchObject({
        subtotal: 50000,
        tax: 5000,
        total: 55000,
        status: 'draft'
      });
    });
  });

  describe('Time-Based Plans', () => {
    it('should generate an invoice based on time entries', async () => {
      // Arrange
      const planId = await TestDataFactory.createBillingPlan(db, context.tenantId, {
        name: 'Hourly Plan',
        type: 'Hourly'
      });

      const serviceId = await TestDataFactory.createService(db, context.tenantId, {
        name: 'Hourly Consultation',
        type: 'Hourly',
        rate: 10000,
        unit: 'hour'
      });

      await db('plan_services').insert({
        plan_id: planId,
        service_id: serviceId,
        custom_rate: 5000,
        tenant: context.tenantId
      });

      await TestDataFactory.assignPlanToCompany(db, context.tenantId, context.companyId, planId);

      const userId = (await db('users').select('user_id').first())?.user_id;
      const ticketId = uuidv4();
      
      await db('tickets').insert({
        tenant: context.tenantId,
        ticket_id: ticketId,
        title: 'Test Ticket',
        company_id: context.companyId,
        status_id: (await db('statuses').where({ tenant: context.tenantId, status_type: 'ticket' }).first())?.status_id,
        entered_by: userId,
        entered_at: new Date(),
        updated_at: new Date()
      });

      // Create a test user if none exists
      const testUserId = await db('users')
        .insert({
          tenant: context.tenantId,
          user_id: uuidv4(),
          username: 'testuser',
          email: 'test@example.com',
          first_name: 'Test',
          last_name: 'User',
          hashed_password: 'dummy-hash',
          role: 'user'  // Adding required role field
        })
        .returning('user_id')
        .then(rows => rows[0].user_id);

      await db('time_entries').insert({
        tenant: context.tenantId,
        entry_id: uuidv4(),
        user_id: testUserId,
        start_time: new Date('2023-01-15T10:00:00Z'),
        end_time: new Date('2023-01-15T12:00:00Z'),
        work_item_id: ticketId,
        work_item_type: 'ticket',
        approval_status: 'APPROVED',
        service_id: serviceId,
        billable_duration: 120
      });

      // Act
      const result = await generateInvoice(context.companyId, '2023-01-01T00:00:00Z', '2023-02-01T00:00:00Z');

      // Assert
      expect(result).toMatchObject({
        subtotal: 10000,
        status: 'draft'
      });

      const invoiceItems = await db('invoice_items')
        .where('invoice_id', result.invoice_id)
        .select('*');

      expect(invoiceItems).toHaveLength(1);
      expect(invoiceItems[0]).toMatchObject({
        description: 'Hourly Consultation',
        quantity: 2,
        unit_price: 5000,
        net_amount: 10000
      });
    });
  });

  describe('Usage-Based Plans', () => {
    it('should generate an invoice based on usage records', async () => {
      // Arrange
      const planId = await TestDataFactory.createBillingPlan(db, context.tenantId, {
        name: 'Usage Plan',
        type: 'Usage'
      });

      const serviceId = await TestDataFactory.createService(db, context.tenantId, {
        name: 'Data Transfer',
        type: 'Usage',
        rate: 10,
        unit: 'GB'
      });

      await db('plan_services').insert({
        plan_id: planId,
        service_id: serviceId,
        tenant: context.tenantId
      });

      await TestDataFactory.assignPlanToCompany(db, context.tenantId, context.companyId, planId);

      await db('usage_tracking').insert([
        {
          tenant: context.tenantId,
          usage_id: uuidv4(),
          company_id: context.companyId,
          service_id: serviceId,
          usage_date: '2023-01-15',
          quantity: 50
        },
        {
          tenant: context.tenantId,
          usage_id: uuidv4(),
          company_id: context.companyId,
          service_id: serviceId,
          usage_date: '2023-01-20',
          quantity: 30
        }
      ]);

      // Act
      const result = await generateInvoice(context.companyId, '2023-01-01T00:00:00Z', '2023-02-01T00:00:00Z');

      // Assert
      expect(result).toMatchObject({
        subtotal: 800,
        status: 'draft'
      });

      const invoiceItems = await db('invoice_items')
        .where('invoice_id', result.invoice_id)
        .select('*');

      expect(invoiceItems).toHaveLength(2);
      expect(invoiceItems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            description: 'Data Transfer',
            quantity: 50,
            unit_price: 10,
            net_amount: 500
          }),
          expect.objectContaining({
            description: 'Data Transfer',
            quantity: 30,
            unit_price: 10,
            net_amount: 300
          })
        ])
      );
    });
  });

  describe('Bucket Plans', () => {
    it('should handle overage charges correctly', async () => {
      // Arrange
      const planId = await TestDataFactory.createBillingPlan(db, context.tenantId, {
        name: 'Bucket Plan',
        type: 'Bucket'
      });

      const serviceId = await TestDataFactory.createService(db, context.tenantId, {
        name: 'Consulting Hours',
        type: 'Bucket',
        rate: 0
      });

      const bucketPlanId = uuidv4();
      await db('bucket_plans').insert({
        bucket_plan_id: bucketPlanId,
        plan_id: planId,
        total_hours: 40,
        billing_period: 'Monthly',
        overage_rate: 7500,
        tenant: context.tenantId
      });

      await TestDataFactory.assignPlanToCompany(db, context.tenantId, context.companyId, planId);

      await db('bucket_usage').insert({
        usage_id: uuidv4(),
        bucket_plan_id: bucketPlanId,
        company_id: context.companyId,
        period_start: '2023-01-01',
        period_end: '2023-01-31',
        hours_used: 45,
        overage_hours: 5,
        service_catalog_id: serviceId,
        tenant: context.tenantId
      });

      // Act
      const result = await generateInvoice(context.companyId, '2023-01-01T00:00:00Z', '2023-02-01T00:00:00Z');

      // Assert
      expect(result).toMatchObject({
        subtotal: 37500,
        status: 'draft'
      });

      const invoiceItems = await db('invoice_items')
        .where('invoice_id', result.invoice_id)
        .select('*');

      expect(invoiceItems).toHaveLength(1);
      expect(invoiceItems[0]).toMatchObject({
        description: expect.stringContaining('Consulting Hours (Overage)'),
        quantity: 5,
        unit_price: 7500,
        net_amount: 37500
      });
    });
  });

  describe('Invoice Finalization', () => {
    it('should finalize an invoice correctly', async () => {
      // Arrange
      const planId = await TestDataFactory.createBillingPlan(db, context.tenantId, {
        name: 'Simple Plan',
        type: 'Fixed'
      });

      const serviceId = await TestDataFactory.createService(db, context.tenantId, {
        name: 'Basic Service',
        type: 'Fixed',
        rate: 20000
      });

      await db('plan_services').insert({
        plan_id: planId,
        service_id: serviceId,
        quantity: 1,
        tenant: context.tenantId
      });

      await TestDataFactory.assignPlanToCompany(db, context.tenantId, context.companyId, planId);

      const invoice = await generateInvoice(context.companyId, '2023-01-01T00:00:00Z', '2023-02-01T00:00:00Z');

      // Act
      const finalizedInvoice = await finalizeInvoice(invoice.invoice_id);

      // Assert
      expect(finalizedInvoice).toMatchObject({
        invoice_id: invoice.invoice_id,
        status: 'sent',
        finalized_at: expect.any(Date)
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid billing period dates', async () => {
      await expect(generateInvoice(
        context.companyId,
        '2023-02-01T00:00:00Z',
        '2023-01-01T00:00:00Z'
      )).rejects.toThrow('Invalid billing period: start date must be before end date');
    });

    it('should handle missing billing plans', async () => {
      const newCompanyId = await TestDataFactory.createCompany(db, context.tenantId, 'Company Without Plans');
      
      await expect(generateInvoice(
        newCompanyId,
        '2023-01-01T00:00:00Z',
        '2023-02-01T00:00:00Z'
      )).rejects.toThrow(`No active billing plans found for company ${newCompanyId} in the given period`);
    });

    it('should handle undefined service rates', async () => {
      const planId = await TestDataFactory.createBillingPlan(db, context.tenantId, {
        name: 'Invalid Plan',
        type: 'Fixed'
      });

      const serviceId = await TestDataFactory.createService(db, context.tenantId, {
        name: 'Service Without Rate',
        type: 'Fixed'
        // rate is intentionally undefined
      });

      await db('plan_services').insert({
        plan_id: planId,
        service_id: serviceId,
        tenant: context.tenantId
      });

      await TestDataFactory.assignPlanToCompany(db, context.tenantId, context.companyId, planId);

      await expect(generateInvoice(
        context.companyId,
        '2023-01-01T00:00:00Z',
        '2023-02-01T00:00:00Z'
      )).rejects.toThrow();
    });
  });
});
