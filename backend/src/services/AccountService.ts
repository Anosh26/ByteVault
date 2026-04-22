import { poolA } from '../db.ts';

export type AccountLocation = {
  id: string;
  branch: 'MAIN' | 'SUB';
};

export class AccountService {
  static async resolveByNumber(accountNumber: string): Promise<AccountLocation | null> {
    try {
      const local = await poolA().query('SELECT id FROM accounts WHERE account_number = $1', [accountNumber]);
      if (local.rows.length > 0) return { id: local.rows[0].id, branch: 'MAIN' };

      const foreign = await poolA().query(
        'SET statement_timeout = 2000; SELECT id FROM fdw_sub.accounts WHERE account_number = $1',
        [accountNumber]
      );
      if (foreign.rows.length > 0) return { id: foreign.rows[0].id, branch: 'SUB' };
    } catch (e) {
      console.error(`Account resolution error for ${accountNumber}:`, e);
    } finally {
      await poolA().query('RESET statement_timeout').catch(() => {});
    }
    return null;
  }
}
