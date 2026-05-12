import http from 'http';
import { AddressInfo } from 'net';
import { createServer } from '../src/server';

const sendEstimate = async (port: number, body: unknown) => {
  const response = await fetch(`http://127.0.0.1:${port}/estimate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    body: await response.json(),
  };
};

describe('Shipping estimator API', () => {
  let server: http.Server;
  let port: number;

  beforeAll((done) => {
    server = createServer();
    server.listen(0, () => {
      const address = server.address() as AddressInfo;
      port = address.port;
      done();
    });
  });

  afterAll((done) => {
    server.close(done);
  });

  it('returns estimated prices for fixed and banded price options', async () => {
    const request = {
      currency: 'USD',
      items: [{ price: '20.00', quantity: 1 }],
      options: [
        { id: 'fixed-1', type: 'fixed', price: '7.50' },
        {
          id: 'banded-1',
          type: 'bandedPrice',
          useFlatRates: false,
          bands: [
            { minimum: '0', amount: '10.00', amountType: 'RATE' },
            { minimum: '20', amount: '0.10', amountType: 'PERCENTAGE' },
          ],
        },
      ],
    };

    const { status, body } = await sendEstimate(port, request);

    expect(status).toBe(200);
    expect(body).toEqual({
      optionPrices: [
        { optionId: 'fixed-1', price: '7.50', currency: 'USD' },
        { optionId: 'banded-1', price: '2.00', currency: 'USD' },
      ],
    });
  });

  it('returns validation errors when the request is malformed', async () => {
    const request = {
      currency: 'USD',
      items: [{ price: '10.00', quantity: 1 }],
      options: [{ id: 'bad-fixed', type: 'fixed' }],
    };

    const { status, body } = await sendEstimate(port, request);

    expect(status).toBe(400);
    expect(body.errors).toContain('options[0].price is required for fixed fulfillment options');
  });

  it('preserves legacy duplicate-band minimum selection and chooses the lowest price', async () => {
    const request = {
      currency: 'USD',
      items: [{ price: '10.00', quantity: 2 }],
      options: [
        {
          id: 'duplicate-minimum',
          type: 'bandedPrice',
          useFlatRates: false,
          bands: [
            { minimum: '10', amount: '30.00', amountType: 'RATE' },
            { minimum: '10', amount: '20.00', amountType: 'RATE' },
            { minimum: '10', amount: '10.00', amountType: 'RATE' },
          ],
        },
      ],
    };

    const { status, body } = await sendEstimate(port, request);

    expect(status).toBe(200);
    expect(body).toEqual({
      optionPrices: [
        { optionId: 'duplicate-minimum', price: '10.00', currency: 'USD' },
      ],
    });
  });
});
