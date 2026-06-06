jest.mock('bcrypt', () => ({
  compare: jest.fn((raw, hashed) =>
    Promise.resolve(hashed === `$mock-bcrypt$${String(raw)}`),
  ),
  hash: jest.fn((raw) => Promise.resolve(`$mock-bcrypt$${String(raw)}`)),
}));

jest.mock('sharp', () => {
  const sharp = jest.fn((input) => ({
    metadata: jest.fn(() =>
      Promise.resolve({ format: 'jpeg', height: 100, width: 100 }),
    ),
    resize: jest.fn().mockReturnThis(),
    toBuffer: jest.fn(() => Promise.resolve(Buffer.from(input ?? []))),
    webp: jest.fn().mockReturnThis(),
  }));

  return sharp;
});
