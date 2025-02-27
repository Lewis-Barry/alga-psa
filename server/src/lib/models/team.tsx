import logger from '../../utils/logger';
import { ITeam } from '../../interfaces';
import { createTenantKnex } from '../db';
import { v4 as uuid4 } from 'uuid';

const Team = {
    create: async (teamData: Omit<ITeam, 'team_id' | 'tenant' | 'members'>): Promise<ITeam> => {
        try {
            if (!teamData.manager_id) {
                throw new Error('manager_id is required when creating a team');
            }
            logger.info('Creating new team:', teamData);
            const {knex: db, tenant} = await createTenantKnex();
            const [createdTeam] = await db<ITeam>('teams')
                .insert({
                    ...teamData,
                    team_id: uuid4(),
                    tenant: tenant!
                })
                .returning('*');
            
            if (!createdTeam) {
                throw new Error('Failed to create team');
            }

            logger.info('Team created successfully:', createdTeam);
            return createdTeam;
        } catch (error) {
            logger.error('Error creating team:', error);
            throw error;
        }
    },

    getAll: async (): Promise<ITeam[]> => {
        try {
            const {knex: db, tenant} = await createTenantKnex();
            const teams = await db<ITeam>('teams')
                .whereNotNull('tenant')
                .andWhere('tenant', tenant!)
                .select('*');
            return teams;
        } catch (error) {
            logger.error('Error getting all teams:', error);
            throw error;
        }
    },

    get: async (team_id: string): Promise<ITeam | undefined> => {
        try {
            const {knex: db, tenant} = await createTenantKnex();
            const team = await db<ITeam>('teams')
                .select('*')
                .whereNotNull('tenant')
                .andWhere('tenant', tenant!)
                .andWhere('team_id', team_id)
                .first();
            return team;
        } catch (error) {
            logger.error(`Error getting team with id ${team_id}:`, error);
            throw error;
        }
    },

    insert: async (team: Omit<ITeam, 'team_id'>): Promise<Pick<ITeam, "team_id">> => {
        try {
            logger.info('Inserting team:', team);
            const {knex: db, tenant} = await createTenantKnex();
            const [team_id] = await db<ITeam>('teams')
                .insert({...team, tenant: tenant!})
                .returning('team_id');
            return team_id;
        } catch (error) {
            logger.error('Error inserting team:', error);
            throw error;
        }
    },

    update: async (team_id: string, team: Partial<ITeam>): Promise<void> => {
        try {
            const {knex: db, tenant} = await createTenantKnex();
            await db<ITeam>('teams')
                .whereNotNull('tenant')
                .andWhere('tenant', tenant!)
                .andWhere('team_id', team_id)
                .update(team);
        } catch (error) {
            logger.error(`Error updating team with id ${team_id}:`, error);
            throw error;
        }
    },

    delete: async (team_id: string): Promise<void> => {
        try {
            const {knex: db, tenant} = await createTenantKnex();
            // Delete team members first
            await db('team_members')
                .whereNotNull('tenant')
                .andWhere('tenant', tenant!)
                .andWhere('team_id', team_id)
                .del();
            // Then delete the team
            await db<ITeam>('teams')
                .whereNotNull('tenant')
                .andWhere('tenant', tenant!)
                .andWhere('team_id', team_id)
                .del();
        } catch (error) {
            logger.error(`Error deleting team with id ${team_id}:`, error);
            throw error;
        }
    },

    addMember: async (team_id: string, user_id: string): Promise<void> => {
        try {
            const {knex: db, tenant} = await createTenantKnex();
            // Check if the user is active
            const user = await db('users')
                .select('is_inactive')
                .whereNotNull('tenant')
                .andWhere('tenant', tenant!)
                .andWhere('user_id', user_id)
                .first();
            if (!user || user.is_inactive) {
                throw new Error('Cannot add inactive user to the team');
            }

            await db('team_members').insert({ team_id, user_id, tenant });
        } catch (error) {
            logger.error(`Error adding user ${user_id} to team ${team_id}:`, error);
            throw error;
        }
    },

    removeMember: async (team_id: string, user_id: string): Promise<void> => {
        try {
            const {knex: db, tenant} = await createTenantKnex();
            await db('team_members')
                .whereNotNull('tenant')
                .andWhere('tenant', tenant!)
                .andWhere('team_id', team_id)
                .andWhere('user_id', user_id)
                .del();
        } catch (error) {
            logger.error(`Error removing user ${user_id} from team ${team_id}:`, error);
            throw error;
        }
    },

    getMembers: async (team_id: string): Promise<string[]> => {
        try {
            const {knex: db, tenant} = await createTenantKnex();
            const members = await db('team_members')
                .select('team_members.user_id')
                .join('users', function() {
                    this.on('team_members.user_id', '=', 'users.user_id')
                        .andOn('team_members.tenant', '=', 'users.tenant');
                })
                .whereNotNull('team_members.tenant')
                .andWhere('team_members.tenant', tenant!)
                .andWhere('team_members.team_id', team_id)
                .andWhere('users.is_inactive', false);
            return members.map((member): string => member.user_id);
        } catch (error) {
            logger.error(`Error getting members for team ${team_id}:`, error);
            throw error;
        }
    },
};

export default Team;
