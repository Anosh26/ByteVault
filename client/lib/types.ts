export type EmployeeRole = 'MAKER' | 'CHECKER' | 'MANAGER' | 'ADMIN';

export type Employee = {
  id: string;
  email: string;
  role: EmployeeRole;
  branchId: string | null;
};

export type AccountRow = {
  id: string;
  account_number: string;
  balance: string | number;
  status: string;
  created_at?: string;
};

export type TransferRequestRow = {
  id: string;
  status: string;
  amount: string | number;
  created_at: string;
  updated_at: string;
  created_by_employee_id: string;
  approved_by_employee_id: string | null;
  execution_tx_id: string | null;
};
