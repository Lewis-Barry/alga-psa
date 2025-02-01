import { JobService, JobStepResult } from '@/services/job.service';
import { PDFGenerationService } from '@/services/pdf-generation.service';
import { getEmailService } from '@/services/emailService';
import { StorageService } from '@/lib/storage/StorageService';
import Invoice from '@/lib/models/invoice';
import { createTenantKnex } from '@/lib/db';
import { getCompanyById } from '@/lib/actions/companyActions';
import ContactModel from '@/lib/models/contact';
import fs from 'fs/promises';
import { getConnection } from '@/lib/db/db';
import { JobStatus } from '@/types/job.d';
import { getInvoiceForRendering } from '@/lib/actions/invoiceActions';

export interface InvoiceEmailJobData extends Record<string, unknown> {
  jobServiceId: string;
  tenantId: string;
  invoiceIds: string[];
  steps: {
    stepName: string;
    type: string;
    metadata: {
      invoiceId?: string;
      tenantId: string;
    };
  }[];
  metadata: {
    user_id: string;
    tenantId: string;
  };
}

export class InvoiceEmailHandler {
  static async handle(pgBossJobId: string, data: InvoiceEmailJobData) {
    if (!data.jobServiceId) {
      throw new Error('jobServiceId is required in job data');
    }

    const { tenantId, jobServiceId, invoiceIds, steps } = data;
    if (!tenantId) throw new Error('Tenant ID is required');
    if (!invoiceIds || !invoiceIds.length) throw new Error('No invoice IDs provided');
    
    console.log(`Starting invoice email job: Processing ${invoiceIds.length} invoice(s) for tenant ${tenantId}`);

    const storageService = new StorageService();
    const jobService = await JobService.create();
    const emailService = await getEmailService();
    const pdfService = new PDFGenerationService(storageService, {
      pdfCacheDir: process.env.PDF_CACHE_DIR,
      tenant: tenantId
    });

    try {
      // Process each invoice
      for (let i = 0; i < invoiceIds.length; i++) {
        const invoiceId = invoiceIds[i];
        const pdfStep = steps[i * 2]; // PDF generation step
        const emailStep = steps[i * 2 + 1]; // Email sending step

        try {
          // Get invoice details first for better logging
          const invoice = await getInvoiceForRendering(invoiceId);
          if (!invoice || !invoice.invoice_number) {
            throw new Error(`Failed to get details for Invoice ID ${invoiceId}`);
          }

          const company = await getCompanyById(invoice.company_id);
          if (!company) {
            throw new Error(`Company not found for Invoice #${invoice.invoice_number}`);
          }

          // Step 1: Generate PDF
          const pdfStartResult: JobStepResult = {
            step: pdfStep.type,
            status: 'started',
            invoiceId,
            details: `Generating PDF for Invoice #${invoice.invoice_number} (${company.company_name})`
          };

          await jobService.updateJobStatus(jobServiceId, JobStatus.Processing, {
            tenantId,
            pgBossJobId,
            stepResult: pdfStartResult
          });

          // Generate PDF with invoice number
          const { file_id } = await pdfService.generateAndStore({
            invoiceId,
            invoiceNumber: invoice.invoice_number,
            version: 1
          });

          const pdfCompleteResult: JobStepResult = {
            step: pdfStep.type,
            status: 'completed',
            invoiceId,
            file_id,
            details: `Generated PDF for Invoice #${invoice.invoice_number} (${company.company_name})`
          };

          await jobService.updateJobStatus(jobServiceId, JobStatus.Processing, {
            tenantId,
            pgBossJobId,
            stepResult: pdfCompleteResult
          });

          // Step 2: Send Email
          // Determine recipient email with priority order
          let recipientEmail = company.email;
          let recipientName = company.company_name;

          if (company.billing_contact_id) {
            const contact = await ContactModel.get(company.billing_contact_id);
            if (contact) {
              recipientEmail = contact.email;
              recipientName = contact.full_name;
            }
          } else if (company.billing_email) {
            recipientEmail = company.billing_email;
          }

          if (!recipientEmail) {
            throw new Error(`No valid email address found for ${company.company_name} (Invoice #${invoice.invoice_number})`);
          }

          const emailStartResult: JobStepResult = {
            step: emailStep.type,
            status: 'started',
            invoiceId,
            details: `Sending Invoice #${invoice.invoice_number} to ${recipientName} (${recipientEmail}) at ${company.company_name}`
          };

          await jobService.updateJobStatus(jobServiceId, JobStatus.Processing, {
            tenantId,
            pgBossJobId,
            stepResult: emailStartResult
          });

          // Update invoice contact info
          invoice.contact = {
            name: recipientName,
            address: company.address || ''
          };

          // Get the PDF content and send email
          const { buffer } = await StorageService.downloadFile(file_id);
          const tempPath = `/tmp/invoice_${invoice.invoice_number}_${Date.now()}.pdf`;
          await fs.writeFile(tempPath, buffer);

          try {
            // Send email using the new email service
            const success = await emailService.sendInvoiceEmail(
              {
                ...invoice,
                recipientEmail,
                tenantId,
                company: {
                  name: company.company_name,
                  logo: '',
                  address: company.address || ''
                }
              },
              tempPath
            );

            if (!success) {
              throw new Error('Failed to send invoice email');
            }

            const emailCompleteResult: JobStepResult = {
              step: emailStep.type,
              status: 'completed',
              invoiceId,
              recipientEmail,
              details: `Successfully sent Invoice #${invoice.invoice_number} to ${recipientName} at ${company.company_name}`
            };

            await jobService.updateJobStatus(jobServiceId, JobStatus.Processing, {
              tenantId,
              pgBossJobId,
              stepResult: emailCompleteResult
            });

          } finally {
            // Clean up temporary file
            await fs.unlink(tempPath);
          }

        } catch (error) {
          console.log('failed to process invoice:', error);
          const invoice = await getInvoiceForRendering(invoiceId);
          const company = invoice ? await getCompanyById(invoice.company_id) : null;
          const invoiceNumber = invoice?.invoice_number || invoiceId;
          const companyName = company?.company_name || 'Unknown Company';
          
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          const contextualError = `Failed to process Invoice #${invoiceNumber} for ${companyName}: ${errorMessage}`;
          
          await jobService.updateJobStatus(jobServiceId, JobStatus.Failed, {
            tenantId,
            pgBossJobId,
            error: contextualError
          });
          throw error;
        }
      }

      // All invoices processed successfully
      await jobService.updateJobStatus(jobServiceId, JobStatus.Completed, {
        tenantId,
        pgBossJobId,
        details: `Successfully processed ${invoiceIds.length} invoice(s)`
      });

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await jobService.updateJobStatus(jobServiceId, JobStatus.Failed, {
        error: errorMessage,
        tenantId,
        pgBossJobId
      });
      throw error;
    }
  }
}
