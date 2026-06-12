const BACKEND_API_URL = process.env.BACKEND_API_URL || "http://localhost:5000";
const API_KEY = process.env.HELPDESK_WEBHOOK_API_KEY || "test123";

export type QuoteRequest = {
  customer_name: string;
  mobile: string;
  email: string;
  event_type: string;
  event_date: string;
  location: string;
  guest_count: number;
  requirements: string[];
};

export type QuoteResponse = {
  estimatedRange: string;
  minimumEstimate: number;
  maximumEstimate: number;
  message: string;
};

export type CreateLeadRequest = {
  customer_name: string;
  mobile: string;
  email: string;
  event_type: string;
  event_date: string;
  location: string;
  guest_count: number;
  requirements: string[];
  customer_budget?: number;
};

export type CreateLeadResponse = {
  success: boolean;
  leadId: string;
  message: string;
};

export type UpdateEstimateRequest = {
  leadId: string;
  estimatedQuoteRange: string;
};

export type ComplaintRequest = {
  customerName: string;
  mobileNumber: string;
  complaintType: string;
  complaintDescription: string;
  address: string;
};

/**
 * 1. Estimate Quotation API Call
 */
export async function estimateQuotation(payload: QuoteRequest): Promise<QuoteResponse> {
  const url = `${BACKEND_API_URL}/api/retell/quote/estimate`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Quotation API failed: ${res.statusText} - ${errorText}`);
  }

  return res.json();
}

/**
 * 2. Create CRM Lead API Call
 */
export async function createCrmLead(payload: CreateLeadRequest): Promise<CreateLeadResponse> {
  const url = `${BACKEND_API_URL}/api/retell/leads/create`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Create Lead API failed: ${res.statusText} - ${errorText}`);
  }

  return res.json();
}

/**
 * 3. Update Lead Estimate API Call
 */
export async function updateLeadEstimate(payload: UpdateEstimateRequest): Promise<{ success: boolean }> {
  const url = `${BACKEND_API_URL}/api/retell/leads/update-estimate`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Update Estimate API failed: ${res.statusText} - ${errorText}`);
  }

  return res.json();
}

/**
 * 4. Lodge Complaint / Webhook API Call
 */
export async function lodgeComplaint(payload: ComplaintRequest, callId: string): Promise<any> {
  const url = `${BACKEND_API_URL}/api/retell/webhook`;
  
  const webhookBody = {
    event: "call_analyzed",
    call: {
      call_id: callId,
      customer_name: payload.customerName,
      mobile_number: payload.mobileNumber,
      complaint_type: payload.complaintType,
      complaint_description: payload.complaintDescription,
      address: payload.address,
      complaint_registered: true
    }
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY
    },
    body: JSON.stringify(webhookBody)
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Lodge Complaint API failed: ${res.statusText} - ${errorText}`);
  }

  return res.json();
}
