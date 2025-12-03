/**
 * Project Service Tests
 *
 * Tests project service with mocked database:
 * - getUserProjects
 * - createProject
 * - updateProject
 * - deleteProject
 * - Links CRUD
 * - Articles CRUD
 */

// Mock database
const mockQuery = jest.fn();
const mockClient = {
  query: jest.fn(),
  release: jest.fn()
};
const mockPool = {
  connect: jest.fn().mockResolvedValue(mockClient)
};

jest.mock('../../backend/config/database', () => ({
  query: (...args) => mockQuery(...args),
  pool: mockPool
}));

// Mock logger
jest.mock('../../backend/config/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}));

const projectService = require('../../backend/services/project.service');

describe('Project Service', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockClient.query.mockReset();
  });

  describe('getUserProjects', () => {
    it('should return user projects with pagination', async () => {
      const mockProjects = [
        {
          id: 1,
          name: 'Project 1',
          created_at: new Date().toISOString(),
          links_count: '5',
          articles_count: '2'
        },
        {
          id: 2,
          name: 'Project 2',
          created_at: new Date().toISOString(),
          links_count: '10',
          articles_count: '0'
        }
      ];

      // Note: getUserProjects(userId, page, limit) returns {data, pagination} when limit < 100
      mockQuery
        .mockResolvedValueOnce({ rows: mockProjects }) // Projects query
        .mockResolvedValueOnce({ rows: [{ count: '2' }] }); // Count query

      const result = await projectService.getUserProjects(1, 1, 10);

      expect(result).toBeDefined();
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('pagination');
      expect(result.data).toHaveLength(2);
      expect(result.data[0].name).toBe('Project 1');
    });

    it('should return empty array for user with no projects', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const result = await projectService.getUserProjects(1, 1, 10);

      expect(result).toHaveProperty('data');
      expect(result.data).toEqual([]);
    });
  });

  describe('getProjectWithDetails', () => {
    it('should return project with links and articles', async () => {
      // getProjectWithDetails makes 3 queries: project, links, articles
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              name: 'Test Project',
              user_id: 1,
              created_at: new Date().toISOString()
            }
          ]
        })
        .mockResolvedValueOnce({
          rows: [{ id: 1, anchor_text: 'Link 1', url: 'https://example.com' }]
        })
        .mockResolvedValueOnce({
          rows: [{ id: 1, title: 'Article 1', content: 'Content 1' }]
        });

      const result = await projectService.getProjectWithDetails(1, 1);

      expect(result).toBeDefined();
      expect(result.name).toBe('Test Project');
      expect(result.links).toHaveLength(1);
      expect(result.articles).toHaveLength(1);
    });

    it('should return null for non-existent project', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await projectService.getProjectWithDetails(999, 1);

      expect(result).toBeNull();
    });

    it('should return null for project owned by different user', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // Query includes user_id filter

      const result = await projectService.getProjectWithDetails(1, 999);

      expect(result).toBeNull();
    });
  });

  describe('createProject', () => {
    it('should create project with valid data', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            name: 'New Project',
            user_id: 1,
            created_at: new Date().toISOString()
          }
        ]
      });

      const result = await projectService.createProject({
        name: 'New Project',
        userId: 1
      });

      expect(result).toBeDefined();
      expect(result.name).toBe('New Project');
    });

    it('should throw error for missing name', async () => {
      await expect(
        projectService.createProject({
          userId: 1
        })
      ).rejects.toThrow();
    });

    it('should throw error for missing userId', async () => {
      await expect(
        projectService.createProject({
          name: 'Test'
        })
      ).rejects.toThrow();
    });
  });

  describe('updateProject', () => {
    it('should update project name', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            name: 'Updated Name',
            user_id: 1
          }
        ]
      });

      const result = await projectService.updateProject(1, 1, {
        name: 'Updated Name'
      });

      expect(result).toBeDefined();
      expect(result.name).toBe('Updated Name');
    });

    it('should return null for non-existent project', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await projectService.updateProject(999, 1, {
        name: 'Updated'
      });

      expect(result).toBeNull();
    });
  });

  describe('deleteProject', () => {
    it('should delete project and return true', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1 }]
      });

      const result = await projectService.deleteProject(1, 1);

      expect(result).toBe(true);
    });

    it('should return false for non-existent project', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await projectService.deleteProject(999, 1);

      expect(result).toBe(false);
    });
  });

  describe('getProjectLinks', () => {
    it('should return project links', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ id: 1, user_id: 1 }] // Project check
        })
        .mockResolvedValueOnce({
          rows: [
            { id: 1, anchor_text: 'Link 1', url: 'https://example1.com' },
            { id: 2, anchor_text: 'Link 2', url: 'https://example2.com' }
          ]
        });

      const result = await projectService.getProjectLinks(1, 1);

      expect(result).toHaveLength(2);
      expect(result[0].anchor_text).toBe('Link 1');
    });

    it('should return empty array for project with no links', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 1, user_id: 1 }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await projectService.getProjectLinks(1, 1);

      expect(result).toEqual([]);
    });
  });

  describe('addProjectLink', () => {
    it('should add link with valid data', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 1, user_id: 1 }] }) // Project check
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              anchor_text: 'Test Link',
              url: 'https://example.com',
              usage_limit: 999,
              usage_count: 0
            }
          ]
        });

      const result = await projectService.addProjectLink(1, 1, {
        anchor_text: 'Test Link',
        url: 'https://example.com'
      });

      expect(result).toBeDefined();
      expect(result.anchor_text).toBe('Test Link');
      expect(result.url).toBe('https://example.com');
    });

    it('should throw for missing anchor_text', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, user_id: 1 }] });

      await expect(
        projectService.addProjectLink(1, 1, {
          url: 'https://example.com'
        })
      ).rejects.toThrow();
    });

    it('should throw for missing url', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, user_id: 1 }] });

      await expect(
        projectService.addProjectLink(1, 1, {
          anchor_text: 'Test'
        })
      ).rejects.toThrow();
    });
  });

  describe('updateProjectLink', () => {
    it('should update link anchor text', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 1, user_id: 1 }] }) // Project check
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              anchor_text: 'Updated Link',
              url: 'https://example.com'
            }
          ]
        });

      const result = await projectService.updateProjectLink(1, 1, 1, {
        anchor_text: 'Updated Link'
      });

      expect(result).toBeDefined();
      expect(result.anchor_text).toBe('Updated Link');
    });

    it('should return null for non-existent link', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 1, user_id: 1 }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await projectService.updateProjectLink(1, 999, 1, {
        anchor_text: 'Updated'
      });

      expect(result).toBeNull();
    });
  });

  describe('deleteProjectLink', () => {
    it('should delete link and return true', async () => {
      // deleteProjectLink only makes one DELETE query with ownership check
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });

      const result = await projectService.deleteProjectLink(1, 1, 1);

      expect(result).toBe(true);
    });

    it('should return false for non-existent link', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await projectService.deleteProjectLink(1, 999, 1);

      expect(result).toBe(false);
    });
  });

  describe('addProjectLinksBulk', () => {
    it('should add multiple links at once', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 1, user_id: 1 }] }) // Project check
        .mockResolvedValueOnce({
          rows: [
            { id: 1, anchor_text: 'Link 1', url: 'https://example1.com' },
            { id: 2, anchor_text: 'Link 2', url: 'https://example2.com' }
          ]
        });

      const links = [
        { anchor_text: 'Link 1', url: 'https://example1.com' },
        { anchor_text: 'Link 2', url: 'https://example2.com' }
      ];

      const result = await projectService.addProjectLinksBulk(1, 1, links);

      // Returns object with {imported, invalidUrls, summary}
      expect(result).toHaveProperty('imported');
      expect(result).toHaveProperty('summary');
      expect(result.imported).toHaveLength(2);
      expect(result.summary.imported).toBe(2);
    });

    it('should handle empty array', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, user_id: 1 }] });

      await expect(projectService.addProjectLinksBulk(1, 1, [])).rejects.toThrow();
    });

    it('should handle up to 500 links', async () => {
      const links = Array.from({ length: 500 }, (_, i) => ({
        anchor_text: `Link ${i}`,
        url: `https://example${i}.com`
      }));

      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, user_id: 1 }] }).mockResolvedValueOnce({
        rows: links.map((l, i) => ({ id: i + 1, ...l }))
      });

      const result = await projectService.addProjectLinksBulk(1, 1, links);

      expect(result.imported).toHaveLength(500);
      expect(result.summary.imported).toBe(500);
    });
  });

  describe('getProjectArticles', () => {
    it('should return project articles', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, user_id: 1 }] }).mockResolvedValueOnce({
        rows: [
          { id: 1, title: 'Article 1', content: 'Content 1' },
          { id: 2, title: 'Article 2', content: 'Content 2' }
        ]
      });

      const result = await projectService.getProjectArticles(1, 1);

      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('Article 1');
    });
  });

  describe('addProjectArticle', () => {
    it('should add article with valid data', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, user_id: 1 }] }).mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            title: 'New Article',
            content: 'Article content',
            usage_limit: 1,
            usage_count: 0
          }
        ]
      });

      const result = await projectService.addProjectArticle(1, 1, {
        title: 'New Article',
        content: 'Article content'
      });

      expect(result).toBeDefined();
      expect(result.title).toBe('New Article');
      expect(result.usage_limit).toBe(1); // Articles are single-use
    });

    it('should throw for missing title', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, user_id: 1 }] });

      await expect(
        projectService.addProjectArticle(1, 1, {
          content: 'Some content'
        })
      ).rejects.toThrow();
    });
  });

  describe('deleteProjectArticle', () => {
    it('should delete article and return true', async () => {
      // deleteProjectArticle only makes one DELETE query with ownership check
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });

      const result = await projectService.deleteProjectArticle(1, 1, 1);

      expect(result).toBe(true);
    });

    it('should return false for non-existent article', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await projectService.deleteProjectArticle(1, 999, 1);

      expect(result).toBe(false);
    });
  });
});

describe('Project Ownership', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('should only return projects for owner', async () => {
    // getUserProjects with pagination makes 2 queries: data and count
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: 1, name: 'My Project', user_id: 1 }]
      })
      .mockResolvedValueOnce({
        rows: [{ count: '1' }]
      });

    const result = await projectService.getUserProjects(1, 1, 10);

    // Verify query includes user_id filter
    const queryCall = mockQuery.mock.calls[0];
    expect(queryCall[1]).toContain(1); // User ID in params
  });
});

// =============================================
// Additional Coverage Tests
// =============================================

describe('Error Handling', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('getUserProjects', () => {
    it('should throw on database error', async () => {
      mockQuery.mockRejectedValue(new Error('Database connection failed'));

      await expect(projectService.getUserProjects(1, 1, 10)).rejects.toThrow(
        'Database connection failed'
      );
    });

    it('should return raw array when limit >= 100', async () => {
      const mockProjects = [{ id: 1, name: 'Project' }];
      mockQuery.mockResolvedValueOnce({ rows: mockProjects });

      // With limit >= 100, it returns raw array without pagination
      const result = await projectService.getUserProjects(1, 1, 100);

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);
    });
  });

  describe('getProjectWithDetails', () => {
    it('should throw on database error', async () => {
      mockQuery.mockRejectedValue(new Error('Query failed'));

      await expect(projectService.getProjectWithDetails(1, 1)).rejects.toThrow(
        'Query failed'
      );
    });
  });

  describe('createProject', () => {
    it('should throw on database error', async () => {
      mockQuery.mockRejectedValue(new Error('Insert failed'));

      await expect(
        projectService.createProject({ name: 'Test', userId: 1 })
      ).rejects.toThrow('Insert failed');
    });
  });

  describe('updateProject', () => {
    it('should throw on database error', async () => {
      mockQuery.mockRejectedValue(new Error('Update failed'));

      await expect(
        projectService.updateProject(1, 1, { name: 'New Name' })
      ).rejects.toThrow('Update failed');
    });
  });

  describe('deleteProject', () => {
    it('should throw on database error', async () => {
      mockQuery.mockRejectedValue(new Error('Delete failed'));

      await expect(projectService.deleteProject(1, 1)).rejects.toThrow(
        'Delete failed'
      );
    });
  });
});

describe('getProjectLinks - Additional Tests', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('should return null for non-existent project', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // Project not found

    const result = await projectService.getProjectLinks(999, 1);

    expect(result).toBeNull();
  });

  it('should throw on database error', async () => {
    mockQuery.mockRejectedValue(new Error('Query failed'));

    await expect(projectService.getProjectLinks(1, 1)).rejects.toThrow(
      'Query failed'
    );
  });
});

describe('addProjectLink - Additional Tests', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('should return null for non-existent project', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // Project not found

    const result = await projectService.addProjectLink(999, 1, {
      url: 'https://example.com',
      anchor_text: 'Test'
    });

    expect(result).toBeNull();
  });

  it('should throw on database error', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Project found
      .mockRejectedValueOnce(new Error('Insert failed'));

    await expect(
      projectService.addProjectLink(1, 1, {
        url: 'https://example.com',
        anchor_text: 'Test'
      })
    ).rejects.toThrow('Insert failed');
  });
});

describe('updateProjectLink - Additional Tests', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('should return null for non-existent project', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // Project not found

    const result = await projectService.updateProjectLink(999, 1, 1, {
      anchor_text: 'Updated'
    });

    expect(result).toBeNull();
  });

  it('should throw on database error', async () => {
    mockQuery.mockRejectedValue(new Error('Update failed'));

    await expect(
      projectService.updateProjectLink(1, 1, 1, { anchor_text: 'Updated' })
    ).rejects.toThrow('Update failed');
  });
});

describe('addProjectLinksBulk - Additional Tests', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('should return null for non-existent project', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // Project not found

    const result = await projectService.addProjectLinksBulk(999, 1, [
      { url: 'https://example.com', anchor_text: 'Test' }
    ]);

    expect(result).toBeNull();
  });

  it('should throw for more than 500 links', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // Project found

    const links = Array.from({ length: 501 }, (_, i) => ({
      url: `https://example${i}.com`,
      anchor_text: `Link ${i}`
    }));

    await expect(
      projectService.addProjectLinksBulk(1, 1, links)
    ).rejects.toThrow('Maximum 500 links');
  });

  it('should handle invalid URLs in bulk import', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // Project found

    const links = [
      { url: 'not-a-valid-url', anchor_text: 'Invalid' },
      { url: 'also-invalid', anchor_text: 'Also Invalid' }
    ];

    await expect(
      projectService.addProjectLinksBulk(1, 1, links)
    ).rejects.toThrow('Import failed');
  });

  it('should import valid links and report invalid ones', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Project found
      .mockResolvedValueOnce({
        rows: [{ id: 1, url: 'https://valid.com', anchor_text: 'Valid' }]
      });

    const links = [
      { url: 'https://valid.com', anchor_text: 'Valid' },
      { url: 'invalid-url', anchor_text: 'Invalid' }
    ];

    const result = await projectService.addProjectLinksBulk(1, 1, links);

    expect(result.imported).toHaveLength(1);
    expect(result.invalidUrls).toHaveLength(1);
    expect(result.summary.imported).toBe(1);
    expect(result.summary.invalidUrls).toBe(1);
  });

  it('should report empty URL as invalid', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // Project found

    const links = [
      { url: '', anchor_text: 'Empty URL' }
    ];

    await expect(
      projectService.addProjectLinksBulk(1, 1, links)
    ).rejects.toThrow('Import failed');
  });

  it('should throw on database error during bulk insert', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Project found
      .mockRejectedValueOnce(new Error('Bulk insert failed'));

    const links = [
      { url: 'https://example.com', anchor_text: 'Test' }
    ];

    await expect(
      projectService.addProjectLinksBulk(1, 1, links)
    ).rejects.toThrow('Bulk insert failed');
  });
});

describe('deleteProjectLink - Additional Tests', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('should throw on database error', async () => {
    mockQuery.mockRejectedValue(new Error('Delete failed'));

    await expect(projectService.deleteProjectLink(1, 1, 1)).rejects.toThrow(
      'Delete failed'
    );
  });
});

describe('getProjectArticles - Additional Tests', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('should return null for non-existent project', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // Project not found

    const result = await projectService.getProjectArticles(999, 1);

    expect(result).toBeNull();
  });

  it('should throw on database error', async () => {
    mockQuery.mockRejectedValue(new Error('Query failed'));

    await expect(projectService.getProjectArticles(1, 1)).rejects.toThrow(
      'Query failed'
    );
  });
});

describe('addProjectArticle - Additional Tests', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('should return null for non-existent project', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // Project not found

    const result = await projectService.addProjectArticle(999, 1, {
      title: 'Test Article',
      content: 'Content'
    });

    expect(result).toBeNull();
  });

  it('should throw on database error', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Project found
      .mockRejectedValueOnce(new Error('Insert failed'));

    await expect(
      projectService.addProjectArticle(1, 1, {
        title: 'Test',
        content: 'Content'
      })
    ).rejects.toThrow('Insert failed');
  });

  it('should create article with all fields', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Project found
      .mockResolvedValueOnce({
        rows: [{
          id: 1,
          title: 'Full Article',
          content: 'Article content',
          excerpt: 'Summary',
          meta_title: 'SEO Title',
          meta_description: 'SEO Description',
          featured_image: 'https://example.com/image.jpg',
          slug: 'full-article',
          tags: 'tag1, tag2',
          category: 'Category'
        }]
      });

    const result = await projectService.addProjectArticle(1, 1, {
      title: 'Full Article',
      content: 'Article content',
      excerpt: 'Summary',
      meta_title: 'SEO Title',
      meta_description: 'SEO Description',
      featured_image: 'https://example.com/image.jpg',
      slug: 'full-article',
      tags: 'tag1, tag2',
      category: 'Category'
    });

    expect(result.title).toBe('Full Article');
    expect(result.meta_title).toBe('SEO Title');
    expect(result.slug).toBe('full-article');
  });
});

describe('updateProjectArticle', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('should update article successfully', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 1,
        title: 'Updated Title',
        content: 'Updated content',
        excerpt: null,
        meta_title: 'Updated SEO',
        meta_description: null,
        featured_image: null,
        slug: 'updated-title',
        tags: null,
        category: null
      }]
    });

    const result = await projectService.updateProjectArticle(1, 1, 1, {
      title: 'Updated Title',
      content: 'Updated content',
      excerpt: null,
      meta_title: 'Updated SEO',
      meta_description: null,
      featured_image: null,
      slug: 'updated-title',
      tags: null,
      category: null
    });

    expect(result).toBeDefined();
    expect(result.title).toBe('Updated Title');
    expect(result.meta_title).toBe('Updated SEO');
  });

  it('should return null for non-existent article', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // Article not found

    const result = await projectService.updateProjectArticle(1, 999, 1, {
      title: 'Updated',
      content: 'Content',
      excerpt: null,
      meta_title: null,
      meta_description: null,
      featured_image: null,
      slug: null,
      tags: null,
      category: null
    });

    expect(result).toBeNull();
  });

  it('should throw on database error', async () => {
    mockQuery.mockRejectedValue(new Error('Update failed'));

    await expect(
      projectService.updateProjectArticle(1, 1, 1, {
        title: 'Updated',
        content: 'Content',
        excerpt: null,
        meta_title: null,
        meta_description: null,
        featured_image: null,
        slug: null,
        tags: null,
        category: null
      })
    ).rejects.toThrow('Update failed');
  });
});

describe('deleteProjectArticle - Additional Tests', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('should throw on database error', async () => {
    mockQuery.mockRejectedValue(new Error('Delete failed'));

    await expect(projectService.deleteProjectArticle(1, 1, 1)).rejects.toThrow(
      'Delete failed'
    );
  });
});
