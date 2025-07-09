describe("Basic Test", () => {
  it("should run a simple test", () => {
    expect(1 + 1).toBe(2);
  });

  it("should handle string operations", () => {
    const str = "hello world";
    expect(str.toUpperCase()).toBe("HELLO WORLD");
  });

  it("should handle array operations", () => {
    const arr = [1, 2, 3];
    expect(arr.length).toBe(3);
    expect(arr.includes(2)).toBe(true);
  });
});
