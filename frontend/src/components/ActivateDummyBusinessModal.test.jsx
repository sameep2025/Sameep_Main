import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import axios from "axios";
import ActivateDummyBusinessModal from "./ActivateDummyBusinessModal";

jest.mock("axios", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

describe("ActivateDummyBusinessModal category ordering", () => {
  beforeEach(() => {
    axios.get.mockResolvedValue({
      data: [
        { categoryId: "popular-category", name: "Popular" },
        { categoryId: "zero-category", name: "Zero Count" },
      ],
    });
    axios.post.mockResolvedValue({ data: { _id: "vendor-1" } });
  });

  afterEach(() => jest.clearAllMocks());

  test("loads the ordered count response and submits the selected canonical category ID", async () => {
    const onActivated = jest.fn();
    render(
      <ActivateDummyBusinessModal
        show
        onClose={jest.fn()}
        customer={{ _id: "customer-1", phone: "9876543210" }}
        onActivated={onActivated}
      />
    );

    expect(await screen.findByRole("option", { name: "Popular" })).toHaveValue(
      "popular-category"
    );
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining("/api/dummy-vendors/categories/counts")
    );

    fireEvent.change(screen.getByPlaceholderText("Business Name"), {
      target: { value: "Example Salon" },
    });
    fireEvent.change(screen.getByPlaceholderText("Contact Name"), {
      target: { value: "Owner" },
    });
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "zero-category" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining("/api/dummy-vendors"),
        expect.objectContaining({ categoryId: "zero-category" })
      );
      expect(onActivated).toHaveBeenCalledWith("vendor-1", {
        target: "dummy",
        categoryId: "zero-category",
      });
    });
  });
});
