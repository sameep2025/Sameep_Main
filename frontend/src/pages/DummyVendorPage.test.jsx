import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import axios from "axios";
import DummyVendorPage from "./DummyVendorPage";

const mockNavigate = jest.fn();

jest.mock("axios", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
  },
}));

jest.mock(
  "react-router-dom",
  () => ({
    useNavigate: () => mockNavigate,
  }),
  { virtual: true }
);

describe("Admin Vendors category cards", () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    axios.get.mockResolvedValue({
      data: [
        { categoryId: "salon-id", name: "Salon & Spa", totalVendors: 12 },
        { categoryId: "alpha-id", name: "Alpha Care", totalVendors: 1 },
        { categoryId: "beauty-id", name: "beauty", totalVendors: 1 },
        { categoryId: "zero-a-id", name: "Appliances", totalVendors: 0 },
        { categoryId: "zero-z-id", name: "Zoology", totalVendors: 0 },
      ],
    });
  });

  afterEach(() => jest.clearAllMocks());

  test("renders the Published-only ordered response and navigates with its category ID", async () => {
    render(<DummyVendorPage />);

    await waitFor(() => {
      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining("/api/dummy-vendors/categories/counts")
      );
    });
    await screen.findByText("Salon & Spa");

    const headings = screen.getAllByRole("heading", { level: 3 });
    expect(headings.map((heading) => heading.textContent)).toEqual([
      "Salon & Spa",
      "Alpha Care",
      "beauty",
      "Appliances",
      "Zoology",
    ]);
    expect(screen.getByText("Salon & Spa").parentElement).toHaveTextContent(
      "Vendors: 12"
    );
    expect(screen.getByText("Appliances").parentElement).toHaveTextContent(
      "Vendors: 0"
    );

    fireEvent.click(screen.getByText("Salon & Spa").parentElement);
    expect(mockNavigate).toHaveBeenCalledWith(
      "/dummy-vendors/status/salon-id"
    );
  });
});
