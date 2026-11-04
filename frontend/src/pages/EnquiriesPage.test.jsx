import { render, screen, waitFor } from "@testing-library/react";
import API from "../api";
import EnquiriesPage from "./EnquiriesPage";

jest.mock("axios", () => {
  const requestHandlers = [];
  const instance = {
    requestHandlers,
    interceptors: {
      request: {
        use: jest.fn((handler) => requestHandlers.push(handler)),
      },
    },
    get: jest.fn(async (url) => {
      let config = { url, headers: {} };
      requestHandlers.forEach((handler) => {
        config = handler(config);
      });
      instance.lastRequestConfig = config;
      return { data: [] };
    }),
  };

  return {
    __esModule: true,
    default: {
      create: jest.fn(() => instance),
    },
  };
});

describe("EnquiriesPage authentication", () => {
  beforeEach(() => {
    API.get.mockImplementation(async (url) => {
      let config = { url, headers: {} };
      API.requestHandlers.forEach((handler) => {
        config = handler(config);
      });
      API.lastRequestConfig = config;
      return { data: [] };
    });
  });

  afterEach(() => {
    localStorage.clear();
    API.get.mockClear();
    API.lastRequestConfig = undefined;
  });

  test("sends the stored admin token as a Bearer header", async () => {
    const token = "admin-test-token";
    localStorage.setItem("adminToken", token);

    render(<EnquiriesPage />);

    expect(await screen.findByText("No enquiries found.")).toBeInTheDocument();
    await waitFor(() => {
      expect(API.requestHandlers).toHaveLength(1);
      expect(API.lastRequestConfig?.url).toBe("/api/enquiries");
      expect(API.lastRequestConfig?.headers?.Authorization).toBe(`Bearer ${token}`);
    });
  });
});
