'use server';

import { getConnection } from '../db/db';
import { Asset } from '../../interfaces/asset.interfaces';

export async function getClientAssets(): Promise<Asset[]> {
  try {
    const knex = await getConnection();
    const assets = await knex<Asset>('assets')
      .where('tenant', knex.raw('current_tenant()'))
      .orderBy('updated_at', 'desc');

    return assets;
  } catch (error) {
    console.error('Error fetching client assets:', error);
    return [];
  }
}
