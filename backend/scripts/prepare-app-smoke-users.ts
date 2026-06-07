import 'reflect-metadata';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import dataSource from '../src/database/data-source';
import { User } from '../src/users/user.entity';
import { UserSocialProfile } from '../src/users/user-social-profile.entity';

const DRY_RUN =
  process.argv.includes('--dry-run') ||
  process.env.APP_SMOKE_SEED_DRY_RUN === 'true';
const ALLOW_PRODUCTION =
  process.argv.includes('--allow-production') ||
  process.env.APP_SMOKE_SEED_ALLOW_PRODUCTION === 'true';

const ownerEmail = normalizeEmail(
  process.env.APP_SMOKE_SEED_OWNER_EMAIL ?? 'fitmeet-smoke-owner@socialworld.world',
);
const targetEmail = normalizeEmail(
  process.env.APP_SMOKE_SEED_TARGET_EMAIL ?? 'fitmeet-smoke-target@socialworld.world',
);
const city = (process.env.APP_SMOKE_SEED_CITY ?? 'Qingdao').trim() || 'Qingdao';
const nearbyArea =
  (process.env.APP_SMOKE_SEED_LOCATION ?? 'Qingdao University').trim() ||
  'Qingdao University';
const password =
  process.env.APP_SMOKE_SEED_PASSWORD ?? randomPassword();

type SmokeUserInput = {
  email: string;
  name: string;
  color: string;
  gender: string;
  age: number;
  bio: string;
  sports: string[];
  traits: string[];
  lat: number;
  lng: number;
};

const smokeUsers: SmokeUserInput[] = [
  {
    email: ownerEmail,
    name: 'FitMeet Smoke Owner',
    color: '#22C55E',
    gender: 'unknown',
    age: 28,
    bio: 'FitMeet release smoke owner account for Web and iOS staging E2E.',
    sports: ['running', 'fitness', 'walking'],
    traits: ['reliable', 'safe-boundaries'],
    lat: 36.1062,
    lng: 120.4213,
  },
  {
    email: targetEmail,
    name: 'FitMeet Smoke Target',
    color: '#38BDF8',
    gender: 'unknown',
    age: 29,
    bio: 'FitMeet release smoke target account for message and feed read-back.',
    sports: ['running', 'yoga', 'cycling'],
    traits: ['friendly', 'public-space-first'],
    lat: 36.108,
    lng: 120.423,
  },
];

async function main() {
  validateInputs();

  if (DRY_RUN) {
    console.log(
      `[app-smoke-users] dry-run ok: owner=${ownerEmail}, target=${targetEmail}, city=${city}`,
    );
    return;
  }

  await dataSource.initialize();
  try {
    const userRepo = dataSource.getRepository(User);
    const profileRepo = dataSource.getRepository(UserSocialProfile);
    const passwordHash = await bcrypt.hash(password, 10);
    const savedUsers: User[] = [];

    for (const input of smokeUsers) {
      const user =
        (await userRepo.findOne({ where: { email: input.email } })) ??
        userRepo.create({ email: input.email });

      Object.assign(user, {
        password: passwordHash,
        name: input.name,
        avatar: input.name.slice(0, 1),
        color: input.color,
        gender: input.gender,
        age: input.age,
        city,
        lat: input.lat,
        lng: input.lng,
        locationUpdatedAt: new Date(),
        acceptNearbyMatch: true,
        gym: nearbyArea,
        bio: input.bio,
        verified: true,
        singleCert: false,
        interestTags: input.sports,
        trainingDays: 30,
        trainingCount: 12,
        caloriesBurned: 3600,
        bestRecords: [{ name: input.sports[0] ?? 'fitness', value: 'release smoke' }],
        isCoach: false,
        trustScore: 3,
        socialTrustCount: 1,
      });

      const saved = await userRepo.save(user);
      savedUsers.push(saved);

      await profileRepo.save(
        profileRepo.create({
          userId: saved.id,
          gender: input.gender,
          nickname: input.name,
          ageRange: '25-34',
          city,
          nearbyArea,
          traits: input.traits,
          fitnessGoals: input.sports,
          interestTags: input.sports,
          lifestyleTags: ['staging-e2e'],
          socialScenes: ['public fitness smoke test'],
          wantToMeet: ['safe public activity partners'],
          preferredTraits: ['reliable', 'respectful'],
          avoidTraits: ['private-location-first'],
          relationshipGoals: ['fitness partners'],
          openness: 'medium',
          availableTimes: ['weekday evening', 'weekend afternoon'],
          weekdayAvailability: 'weekday evening',
          weekendAvailability: 'weekend afternoon',
          socialPreference: 'Public places first; clear boundaries.',
          rejectRules: 'No private-location first meetings.',
          privacyBoundary: 'Do not expose phone or exact private location.',
          profileDiscoverable: true,
          agentCanRecommendMe: true,
          agentCanStartChatAfterApproval: true,
          hideSensitiveTags: true,
          aiSummary: `${input.name} is a release smoke account for FitMeet staging checks.`,
          aiProfileCard: {
            source: 'app-smoke-users',
            city,
            nearbyArea,
            sports: input.sports,
          },
          matchSignals: {
            publicTags: input.sports,
            matchKeywords: [...input.sports, ...input.traits],
            source: 'app-smoke-users',
          },
          sensitiveTagDecisions: {},
        }),
      );
    }

    const [owner, target] = savedUsers;
    console.log('[app-smoke-users] prepared smoke users.');
    console.log(`ownerUserId=${owner.id}`);
    console.log(`targetUserId=${target.id}`);
    console.log('');
    console.log('# Web/App production smoke env');
    console.log(`export APP_SMOKE_EMAIL=${shellQuote(owner.email)}`);
    console.log(`export APP_SMOKE_PASSWORD=${shellQuote(password)}`);
    console.log(`export APP_SMOKE_TARGET_USER_ID=${target.id}`);
    console.log('');
    console.log('# iOS staging backend E2E env');
    console.log(`export FITMEET_ALPHA_STAGING_EMAIL=${shellQuote(owner.email)}`);
    console.log(`export FITMEET_ALPHA_STAGING_PASSWORD=${shellQuote(password)}`);
    console.log(`export FITMEET_ALPHA_STAGING_MESSAGE_TARGET_USER_ID=${target.id}`);
  } finally {
    if (dataSource.isInitialized) await dataSource.destroy();
  }
}

function validateInputs() {
  if (ownerEmail === targetEmail) {
    throw new Error('Owner and target smoke emails must be different.');
  }
  for (const email of [ownerEmail, targetEmail]) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new Error(`Invalid smoke user email: ${email}`);
    }
  }
  if (password.length < 12) {
    throw new Error('APP_SMOKE_SEED_PASSWORD must be at least 12 characters.');
  }
  if (/^(change_me|password|secret|example|fitmeet@2026)$/i.test(password)) {
    throw new Error('APP_SMOKE_SEED_PASSWORD must not be a placeholder password.');
  }
  if (process.env.NODE_ENV === 'production' && !ALLOW_PRODUCTION) {
    throw new Error(
      'Refusing to write smoke users in production without APP_SMOKE_SEED_ALLOW_PRODUCTION=true or --allow-production.',
    );
  }
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function randomPassword() {
  return `FitMeetSmoke-${randomBytes(12).toString('base64url')}`;
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

main().catch((error) => {
  console.error(`[app-smoke-users] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
